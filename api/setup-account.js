const admin = require('firebase-admin');
const axios = require('axios');

if (!admin.apps.length) {
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  if (pk.startsWith('"')) pk = pk.slice(1, -1);
  pk = pk.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pk,
    }),
  });
}
const db = admin.firestore();

async function createPaystackVA(email, name, ref) {
  const res = await axios.post(
    'https://api.paystack.co/dedicated_account',
    {
      customer: null,
      preferred_bank: 'wema-bank',
      subaccount: null,
    },
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  return res.data;
}

async function createPaystackCustomer(email, name) {
  const res = await axios.post(
    'https://api.paystack.co/customer',
    { email, first_name: name.split(' ')[0], last_name: name.split(' ')[1] || name },
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  return res.data.data;
}

async function createDedicatedAccount(customerCode) {
  const res = await axios.post(
    'https://api.paystack.co/dedicated_account',
    { customer: customerCode, preferred_bank: 'wema-bank' },
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  return res.data.data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = await admin.auth().verifyIdToken(auth.split(' ')[1]);
    const uid = decoded.uid;
    const email = decoded.email;
    const name = decoded.name || email.split('@')[0];

    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data().virtualAccount?.length > 0) {
      return res.status(200).json({ success: true, data: userDoc.data() });
    }

    const refCode = req.body?.refCode || '';
    let referredBy = null;
    if (refCode) {
      const refSnap = await db.collection('users').where('referralCode', '==', refCode).limit(1).get();
      if (!refSnap.empty && refSnap.docs[0].id !== uid) referredBy = refSnap.docs[0].id;
    }

    const myRefCode = uid.slice(0, 6).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    let virtualAccount = [];

    try {
      const customer = await createPaystackCustomer(email, name);
      const va = await createDedicatedAccount(customer.customer_code);
      if (va) {
        virtualAccount = [{
          bankName: va.bank?.name || 'Wema Bank',
          accountNumber: va.account_number,
          accountName: va.account_name,
          customerCode: customer.customer_code,
        }];
      }
    } catch (e) {
      console.error('Paystack VA error:', e.response?.data || e.message);
    }

    const userData = {
      uid, email, name,
      credits: 500,
      virtualAccount,
      referralCode: myRefCode,
      referredBy: referredBy || null,
      referralEarningsNGN: 0,
      referralCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(uid).set(userData, { merge: true });
    await db.collection('users').doc(uid).collection('transactions').add({
      type: 'credit', amount: 500, note: 'Welcome bonus — 500 free credits',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (referredBy) {
      await db.collection('users').doc(referredBy).update({
        referralCount: admin.firestore.FieldValue.increment(1),
      });
    }

    return res.status(200).json({ success: true, data: userData });
  } catch (e) {
    console.error('setup-account error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

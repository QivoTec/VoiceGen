const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  if (pk.startsWith('"')) pk = pk.slice(1, -1);
  pk = pk.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: pk }) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body)).digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.error('Invalid Paystack signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  console.log('Paystack event:', event.event);

  if (event.event !== 'charge.success' && event.event !== 'dedicatedaccount.assign.success') {
    return res.status(200).json({ received: true });
  }

  try {
    const data = event.data;
    const amountPaid = data.amount / 100; // Paystack sends in kobo
    const customerEmail = data.customer?.email;
    const reference = data.reference;

    if (!customerEmail) return res.status(200).json({ received: true });

    // Find user by email
    const usersSnap = await db.collection('users').where('email', '==', customerEmail).limit(1).get();
    if (usersSnap.empty) {
      console.error('No user found for email:', customerEmail);
      return res.status(200).json({ received: true });
    }

    const uid = usersSnap.docs[0].id;

    // Check duplicate
    const existing = await db.collection('users').doc(uid).collection('transactions')
      .where('paymentRef', '==', reference).get();
    if (!existing.empty) return res.status(200).json({ received: true, duplicate: true });

    const creditsToAdd = Math.floor(amountPaid * 10); // ₦100 = 1000 credits

    await db.collection('users').doc(uid).update({
      credits: admin.firestore.FieldValue.increment(creditsToAdd),
    });

    await db.collection('users').doc(uid).collection('transactions').add({
      type: 'credit', amount: creditsToAdd, amountNGN: amountPaid, paymentRef: reference,
      note: `Top-up — ₦${amountPaid.toLocaleString()} — ${creditsToAdd.toLocaleString()} credits`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Referral commission
    const userDoc = await db.collection('users').doc(uid).get();
    const referredBy = userDoc.data()?.referredBy;
    if (referredBy) {
      const commission = Math.floor(amountPaid * 0.05);
      await db.collection('users').doc(referredBy).update({
        referralEarningsNGN: admin.firestore.FieldValue.increment(commission),
      });
    }

    console.log(`Credited ${creditsToAdd} to ${uid}`);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

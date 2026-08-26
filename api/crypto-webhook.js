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
  try {
    const sig = req.headers['x-nowpayments-sig'];
    const sorted = JSON.stringify(req.body, Object.keys(req.body).sort());
    const hash = crypto.createHmac('sha512', process.env.NOW_IPN_SECRET).update(sorted).digest('hex');
    if (sig && hash !== sig) return res.status(400).json({ error: 'Invalid signature' });
    const { payment_status, order_id, actually_paid, pay_amount } = req.body;
    if (!['finished', 'confirmed'].includes(payment_status)) return res.json({ received: true });
    const payDoc = await db.collection('cryptoPayments').doc(order_id).get();
    if (!payDoc.exists) return res.json({ received: true });
    const payData = payDoc.data();
    if (payData.status === 'completed') return res.json({ received: true, duplicate: true });
    let creditsToAdd = payData.creditsAmount;
    await db.collection('users').doc(payData.uid).update({ credits: admin.firestore.FieldValue.increment(creditsToAdd) });
    await db.collection('users').doc(payData.uid).collection('transactions').add({ type: 'credit', amount: creditsToAdd, note: `Crypto top-up — $${payData.amountUSD} USDT`, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('cryptoPayments').doc(order_id).update({ status: 'completed' });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

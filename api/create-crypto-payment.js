const admin = require('firebase-admin');
const axios = require('axios');
if (!admin.apps.length) {
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  if (pk.startsWith('"')) pk = pk.slice(1, -1);
  pk = pk.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: pk }) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = await admin.auth().verifyIdToken(auth.split(' ')[1]);
    const { amountUSD, creditsAmount } = req.body;
    const orderId = `VG-CRYPTO-${decoded.uid.slice(0, 8)}-${Date.now()}`;
    const r = await axios.post('https://api.nowpayments.io/v1/payment', {
      price_amount: amountUSD, price_currency: 'usd', pay_currency: 'usdttrc20',
      order_id: orderId, order_description: `VoiceGen ${creditsAmount} credits`,
      ipn_callback_url: `${process.env.VERCEL_URL}/api/crypto-webhook`,
    }, { headers: { 'x-api-key': process.env.NOW_API_KEY } });
    await db.collection('cryptoPayments').doc(orderId).set({ uid: decoded.uid, email: decoded.email, orderId, amountUSD, creditsAmount: parseInt(creditsAmount), status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true, payAddress: r.data.pay_address, payAmount: r.data.pay_amount, payCurrency: r.data.pay_currency, orderId });
  } catch (e) { return res.status(500).json({ error: e.response?.data?.message || e.message }); }
};

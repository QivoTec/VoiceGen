const admin = require('firebase-admin');
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
    const { amount, currency, bankName, bankCode, accountNumber, accountName, walletAddress, usdAmount, rateUsed } = req.body;
    if (!amount || amount < 10000) return res.status(400).json({ error: 'Minimum withdrawal is ₦10,000' });
    const ref = db.collection('users').doc(decoded.uid);
    const doc = await ref.get();
    const balance = doc.data()?.referralEarningsNGN || 0;
    if (balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
    await ref.update({ referralEarningsNGN: admin.firestore.FieldValue.increment(-amount) });
    const wdData = { uid: decoded.uid, email: decoded.email, amountNGN: amount, currency: currency || 'NGN', status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() };
    if (currency === 'USD') { wdData.walletAddress = walletAddress; wdData.usdAmount = usdAmount; wdData.rateUsed = rateUsed; }
    else { wdData.bankName = bankName; wdData.bankCode = bankCode; wdData.accountNumber = accountNumber; wdData.accountName = accountName; }
    await db.collection('withdrawalRequests').add(wdData);
    await ref.collection('transactions').add({ type: 'withdrawal', amount: -amount, note: `Withdrawal — ₦${amount.toLocaleString()}`, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true, message: 'Withdrawal request submitted. Processing within 20 hours.' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

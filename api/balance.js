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
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = await admin.auth().verifyIdToken(auth.split(' ')[1]);
    const doc = await db.collection('users').doc(decoded.uid).get();
    if (!doc.exists) return res.json({ credits: 0, virtualAccount: [], referralCode: '', referralEarningsNGN: 0, referralCount: 0 });
    const d = doc.data();
    return res.json({ credits: d.credits || 0, virtualAccount: d.virtualAccount || [], referralCode: d.referralCode || '', referralEarningsNGN: d.referralEarningsNGN || 0, referralCount: d.referralCount || 0 });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

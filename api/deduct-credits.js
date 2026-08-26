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
    const { characters, voiceName } = req.body;
    const cost = parseInt(characters);
    if (!cost || cost < 1) return res.status(400).json({ error: 'Invalid' });
    const ref = db.collection('users').doc(decoded.uid);
    const doc = await ref.get();
    const current = doc.exists ? (doc.data().credits || 0) : 0;
    if (current < cost) return res.status(402).json({ error: 'Insufficient credits', required: cost, available: current });
    await ref.update({ credits: admin.firestore.FieldValue.increment(-cost) });
    await ref.collection('transactions').add({ type: 'debit', amount: -cost, note: `Voiceover — ${voiceName} — ${cost} chars`, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true, creditsUsed: cost, remaining: current - cost });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

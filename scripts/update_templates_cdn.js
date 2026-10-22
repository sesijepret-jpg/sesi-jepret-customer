const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCHtWPY2FzbUF1hYNgzquSC0V37AGmkSIY",
  authDomain: "foto-booth-ac86e.firebaseapp.com",
  projectId: "foto-booth-ac86e",
  storageBucket: "foto-booth-ac86e.firebasestorage.app",
  messagingSenderId: "273309231710",
  appId: "1:273309231710:web:7a8b9c0d1e2f3a4b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/sesijepret-jpg/templates@main';

async function updateTemplates() {
  console.log('--- Updating Firestore templates with jsDelivr CDN URLs ---');

  for (let num = 1; num <= 29; num++) {
    const templateId = `template_${num}`;
    const cdnImageUrl = `${CDN_BASE}/${num}.png`;
    const docRef = doc(db, 'templates', templateId);

    await updateDoc(docRef, {
      image_url: cdnImageUrl,
      thumbnail: cdnImageUrl,
      templateImage: cdnImageUrl
    });

    console.log(`[Firestore] Updated ${templateId} -> ${cdnImageUrl}`);
  }

  console.log('--- All 29 templates updated successfully! ---');
  process.exit(0);
}

updateTemplates().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});

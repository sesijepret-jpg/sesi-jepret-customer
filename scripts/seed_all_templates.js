const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const fs = require('fs');
const path = require('path');

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
const storage = getStorage(app);

const templatesDir = path.join(process.cwd(), 'public', 'templates');

async function uploadImageToStorage(num) {
  try {
    const pngPath = path.join(templatesDir, `${num}.png`);
    if (!fs.existsSync(pngPath)) return null;

    const fileBuffer = fs.readFileSync(pngPath);
    const storageRef = ref(storage, `templates/${num}.png`);
    
    // Upload bytes
    await uploadBytes(storageRef, fileBuffer, { contentType: 'image/png' });
    const downloadUrl = await getDownloadURL(storageRef);
    console.log(`[Storage] Uploaded ${num}.png -> ${downloadUrl}`);
    return downloadUrl;
  } catch (err) {
    console.warn(`[Storage] Cannot upload ${num}.png (Storage might not be initialized):`, err.message);
    return null;
  }
}

async function runSeed() {
  console.log('--- Starting migration of 29 templates to Firebase ---');

  for (let num = 1; num <= 29; num++) {
    const layoutPath = path.join(templatesDir, `layout-template-${num}.json`);
    if (!fs.existsSync(layoutPath)) {
      console.warn(`Skipping ${num}: layout file not found`);
      continue;
    }

    const layoutData = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
    
    // Try upload to storage first
    let storageUrl = await uploadImageToStorage(num);
    const finalImageUrl = storageUrl || `/templates/${num}.png`;

    const templateId = `template_${num}`;
    const templateDocRef = doc(db, 'templates', templateId);

    const templateData = {
      name: `Photo Booth ${num}`,
      image_url: finalImageUrl,
      thumbnail: finalImageUrl,
      templateImage: finalImageUrl,
      orientation: 'portrait',
      print_size: '4R',
      category: 'Photo Booth',
      photo_count: layoutData.slotCount || 3,
      active: true,
      canvas_width: layoutData.width || 600,
      canvas_height: layoutData.height || 1800,
      order: num
    };

    await setDoc(templateDocRef, templateData);

    const layoutRef = doc(db, 'templates', templateId, 'layouts', 'active');
    await setDoc(layoutRef, {
      slots: layoutData.slots,
      drawOnTop: layoutData.drawOnTop === true
    });

    console.log(`[Firestore] Saved ${templateId} with ${layoutData.slotCount} slots`);
  }

  console.log('--- Migration completed successfully! ---');
  process.exit(0);
}

runSeed().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});

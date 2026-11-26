// `npm run push:keys` – a new VAPID key pair for browser push (src/lib/notify.ts). Prints the
// lines to put in .env and on Render; nothing is saved. Keep the private key secret, and keep it:
// a new pair means every member has to turn push on again.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:you@example.org"   # a contact address for the push services`);

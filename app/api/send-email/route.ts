import { NextRequest, NextResponse } from 'next/server';
import * as nodemailer from 'nodemailer';

// Izinkan waktu eksekusi lebih lama untuk pengiriman email SMTP
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { email, photo_url, photo_base64, raw_photos, boomerang_gif_base64, session_id } = await req.json();

    // ── Validasi parameter ──────────────────────────────────────────────────
    if (!email || (!photo_url && !photo_base64) || !session_id) {
      return NextResponse.json(
        { error: 'Parameter email, (photo_url atau photo_base64), dan session_id wajib diisi.' },
        { status: 400 }
      );
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return NextResponse.json(
        { error: 'SMTP belum dikonfigurasi di server.' },
        { status: 500 }
      );
    }

    let photoBuffer: Buffer;
    let detectedMime = 'image/png'; // default, since compose outputs PNG

    if (photo_base64) {
      // ── Mode lokal: foto dikirim langsung sebagai base64 ─────────────────
      // Detect MIME from data URL prefix (e.g. "data:image/png;base64,")
      if (photo_base64.startsWith('data:')) {
        const mimeMatch = photo_base64.match(/^data:(image\/[a-z]+);base64,/);
        if (mimeMatch) {
          detectedMime = mimeMatch[1];
        }
      }
      // Strip data URL prefix jika ada
      const base64Data = photo_base64.includes(',') ? photo_base64.split(',')[1] : photo_base64;
      photoBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // ── Mode produksi: fetch foto dari Firebase Storage URL ───────────────
      const response = await fetch(photo_url);
      if (!response.ok) {
        throw new Error(`Gagal mengambil foto dari URL: ${response.statusText}`);
      }
      detectedMime = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      photoBuffer = Buffer.from(arrayBuffer);
    }

    console.log(`[API/send-email] Received request: email=${email}, session_id=${session_id}`);
    console.log(`[API/send-email] photo_base64 provided: ${!!photo_base64}, length: ${photo_base64?.length || 0}`);
    console.log(`[API/send-email] photo_url provided: ${!!photo_url}, value: ${photo_url || 'none'}`);
    console.log(`[API/send-email] Photo buffer size: ${photoBuffer.length} bytes (${(photoBuffer.length / 1024).toFixed(1)} KB), MIME: ${detectedMime}`);

    // Pastikan lampiran tidak kosong
    if (photoBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Foto tidak tersedia. Email tidak dikirim tanpa lampiran.' },
        { status: 422 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const fromAddress = process.env.SMTP_FROM || `"${process.env.SMTP_FROM_NAME || 'Sesijepret Photo Booth'}" <${
      process.env.SMTP_FROM_EMAIL || user
    }>`;

    const textBody = `Halo,

Terima kasih telah menggunakan Sesijepret.

Foto yang Anda abadikan telah berhasil diproses. Kami melampirkan foto strip berbingkai, seluruh foto pose asli (tanpa frame), serta animasi Boomerang Ping-Pong (.gif) pada email ini agar dapat Anda simpan dan bagikan ke media sosial.

Semoga momen tersebut menjadi kenangan indah bersama keluarga, sahabat, maupun orang tersayang.

Sampai jumpa di sesi foto berikutnya.

Salam,
Sesijepret`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Sesijepret Memories</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#E6007A,#9b27af);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                📸 Your Sesijepret Memories
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.7;">
                Halo,
              </p>
              <p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.7;">
                Terima kasih telah menggunakan <strong>Sesijepret</strong>.
              </p>
              <p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.7;">
                Foto yang Anda abadikan telah berhasil diproses. Kami melampirkan <strong>foto strip berbingkai</strong>, <strong>seluruh foto pose asli (tanpa frame)</strong>, serta <strong>animasi Boomerang Ping-Pong (.gif)</strong> pada email ini agar dapat Anda simpan dan bagikan ke media sosial.
              </p>
              <p style="margin:0 0 24px;color:#333333;font-size:15px;line-height:1.7;">
                Semoga momen tersebut menjadi kenangan indah bersama keluarga, sahabat, maupun orang tersayang.
              </p>

              <!-- Divider -->
              <hr style="border:0;border-top:1px solid #eeeeee;margin:24px 0;" />

              <p style="margin:0 0 8px;color:#333333;font-size:15px;line-height:1.7;">
                Sampai jumpa di sesi foto berikutnya.
              </p>
              <p style="margin:0;color:#555555;font-size:15px;line-height:1.7;">
                Salam,<br />
                <strong>Sesijepret</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9fb;padding:20px 40px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:11px;color:#aaaaaa;">
                © ${new Date().getFullYear()} Sesijepret Photo Booth. Dikirim dengan 💜
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const fileExt = detectedMime === 'image/png' ? 'png' : 'jpg';

    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }> = [
      {
        filename: `Sesijepret_${session_id}_strip.${fileExt}`,
        content: photoBuffer,
        contentType: detectedMime,
      },
    ];

    if (Array.isArray(raw_photos) && raw_photos.length > 0) {
      raw_photos.forEach((poseBase64, index) => {
        if (!poseBase64 || typeof poseBase64 !== 'string') return;
        let poseMime = 'image/jpeg';
        if (poseBase64.startsWith('data:')) {
          const match = poseBase64.match(/^data:(image\/[a-z]+);base64,/);
          if (match) poseMime = match[1];
        }
        const cleanBase64 = poseBase64.includes(',') ? poseBase64.split(',')[1] : poseBase64;
        const poseExt = poseMime === 'image/png' ? 'png' : 'jpg';
        attachments.push({
          filename: `Sesijepret_${session_id}_pose_${index + 1}.${poseExt}`,
          content: Buffer.from(cleanBase64, 'base64'),
          contentType: poseMime,
        });
      });
    }

    if (boomerang_gif_base64 && typeof boomerang_gif_base64 === 'string') {
      const cleanGifBase64 = boomerang_gif_base64.includes(',')
        ? boomerang_gif_base64.split(',')[1]
        : boomerang_gif_base64;
      const gifBuffer = Buffer.from(cleanGifBase64, 'base64');
      if (gifBuffer.length > 0) {
        attachments.push({
          filename: `Sesijepret_${session_id}_boomerang.gif`,
          content: gifBuffer,
          contentType: 'image/gif',
        });
        console.log(`[API/send-email] Added Boomerang GIF attachment (${(gifBuffer.length / 1024).toFixed(1)} KB)`);
      }
    }

    console.log(`[API/send-email] Sending ${attachments.length} attachments to ${email}`);

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Your Sesijepret Memories 📸',
      text: textBody,
      html: htmlBody,
      attachments,
    });

    console.log(`[API/send-email] ✅ Email sent to ${email} for session ${session_id}`);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Internal Server Error';
    console.error('[API/send-email] ❌ Error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

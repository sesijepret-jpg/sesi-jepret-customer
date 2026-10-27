import {
  Firestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppConstants } from '../constants/app_constants';

const DEMO_VOUCHERS = ['A7FD', 'B3K9', 'C2M1', 'D8P4'];

export class CodeAlreadyUsedException extends Error {
  constructor(public readonly code: string) {
    super('Kode sudah digunakan.');
    this.name = 'CodeAlreadyUsedException';
    Object.setPrototypeOf(this, CodeAlreadyUsedException.prototype);
  }
}

export class VoucherRepository {
  private readonly firestore: Firestore;

  constructor(firestore?: Firestore) {
    this.firestore = firestore || db;
  }

  private get vouchersCollection() {
    return collection(this.firestore, AppConstants.colVouchers);
  }

  private get sessionsCollection() {
    return collection(this.firestore, AppConstants.colSessions);
  }

  private getDocRef(code: string) {
    return doc(this.vouchersCollection, code.toUpperCase());
  }

  /**
   * Melakukan validasi kode dan pembuatan session secara atomik dalam satu Firestore Transaction.
   * Mengupdate status kode menjadi USED, is_used = true, session_id = id session.
   * Jika salah satu gagal, maka seluruh operasi di-rollback.
   */
  async validateAndActivateVoucher(params: {
    rawCode: string;
    device: string;
  }): Promise<string> {
    const { rawCode, device } = params;
    const code = rawCode.trim().toUpperCase();

    // Jika offline / demo mode fallback
    if (DEMO_VOUCHERS.includes(code)) {
      console.log(`[VoucherRepo] Menggunakan demo voucher: ${code}`);
      return `demo_session_${code}`;
    }

    const voucherDocRef = this.getDocRef(code);
    const sessionDocRef = doc(this.sessionsCollection);
    const sessionId = sessionDocRef.id;

    console.log(`Updating code: ${code}`);

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const docSnapshot = await transaction.get(voucherDocRef);

        if (!docSnapshot.exists()) {
          throw new Error('Kode tidak ditemukan. Periksa kembali kode Anda.');
        }

        const data = docSnapshot.data() || {};
        const isUsed = !!data.is_used;
        const status = data.status || 'ACTIVE';

        // Validasi: status == USED atau is_used == true
        if (isUsed || status === 'USED') {
          throw new CodeAlreadyUsedException(code);
        }

        // Tandai voucher sebagai sudah terpakai (sesuai aturan keamanan Firestore)
        transaction.update(voucherDocRef, {
          is_used: true,
          status: 'USED',
          used_at: serverTimestamp(),
          session_id: sessionId,
        });

        // Buat dokumen session dengan kode voucher terkait
        transaction.set(sessionDocRef, {
          code,
          status: 'STARTED',
          stage: 'STARTED',
          started_at: serverTimestamp(),
          finished_at: null,
          device,
          template_id: null,
          template_name: null,
          email: null,
          printed: false,
          photo_count: 0,
        });
      });

      console.log(`Voucher ${code} berhasil di-redeem dan status diubah menjadi USED.`);
      return sessionId;
    } catch (e) {
      console.error("Transaction failed:", e);
      throw e;
    }
  }
}

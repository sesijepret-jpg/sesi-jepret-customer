'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PreviewPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/edit-photo');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E83E8C] border-t-transparent" />
        <p className="text-sm font-medium text-black/60">Mengarahkan ke halaman edit foto...</p>
      </div>
    </div>
  );
}

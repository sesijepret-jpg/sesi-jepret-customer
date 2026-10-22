'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import Card from '@/components/ui/Card';
import PageTitle from '@/components/ui/PageTitle';
import Typography from '@/components/ui/Typography';
import { ArrowLeft, Camera, Check } from 'lucide-react';
import { TemplateService } from '@/services/template_service';
import { TemplateModel } from '@/models/template_model';

import { useSessionStore } from '@/store/session_store';
import { SessionRepository } from '@/repositories/session_repository';
import { startSessionTimer, getSessionTimeLeft, useSessionTimer, formatTime } from '@/hooks/useSessionTimer';

const templateService = new TemplateService();
const sessionRepository = new SessionRepository();

type TemplateCard = {
  id: string;
  name: string;
  photoCount: number;
  imageUrl: string;
  tag: string;
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateModel[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionId = useSessionStore((state) => state.sessionId);
  const setSelectedTemplateStore = useSessionStore((state) => state.setSelectedTemplate);

  const sessionTimeLeft = useSessionTimer(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('boro_selected_template');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { id: string; name: string };
        setSelectedTemplateId(parsed.id);
      } catch (_) {
        setSelectedTemplateId(null);
      }
    }

    // Mulai timer 15 menit saat customer masuk halaman pilih template.
    // Guard: hanya mulai jika belum ada timer aktif agar tidak di-reset
    // ketika customer kembali ke halaman ini.
    if (getSessionTimeLeft() === 0) {
      startSessionTimer();
    }
  }, []);

  useEffect(() => {
    templateService
      .getActiveTemplates()
      .then((fetched) => setTemplates(fetched))
      .catch(() => setTemplates(TemplateModel.localTemplates))
      .finally(() => setLoading(false));
  }, []);

  const cards: TemplateCard[] = useMemo(() => {
    const sourceTemplates = templates.length > 0 ? templates : TemplateModel.localTemplates;

    return sourceTemplates.map((template, index) => ({
      id: template.id,
      name: template.name || `Template ${index + 1}`,
      photoCount: template.photoCount || 3,
      imageUrl: template.thumbnail || template.imageUrl,
      tag: index === 0 ? 'Populer' : '',
    }));
  }, [templates]);

  const TUTORIAL_UPI_NUMBERS = [11, 13, 14, 15, 16, 21, 22, 23, 25, 26];

  const getTemplateNum = (tpl: TemplateCard) => {
    const match = tpl.id.match(/\d+/) || tpl.name.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const { upiCards, otherCards } = useMemo(() => {
    const upiList: TemplateCard[] = [];
    const othersList: TemplateCard[] = [];

    cards.forEach((card) => {
      const num = getTemplateNum(card);
      if (TUTORIAL_UPI_NUMBERS.includes(num)) {
        upiList.push({
          ...card,
          tag: 'Tutorial UPI',
        });
      } else {
        othersList.push(card);
      }
    });

    upiList.sort((a, b) => {
      const orderA = TUTORIAL_UPI_NUMBERS.indexOf(getTemplateNum(a));
      const orderB = TUTORIAL_UPI_NUMBERS.indexOf(getTemplateNum(b));
      return orderA - orderB;
    });

    othersList.sort((a, b) => getTemplateNum(a) - getTemplateNum(b));

    return { upiCards: upiList, otherCards: othersList };
  }, [cards]);

  const selectedTemplate = useMemo(
    () => cards.find((template) => template.id === selectedTemplateId) ?? null,
    [cards, selectedTemplateId]
  );

  const handleSelect = (template: TemplateCard) => {
    setSelectedTemplateId(template.id);
    setSelectedTemplateStore(template.id, template.name);
    sessionStorage.setItem(
      'boro_selected_template',
      JSON.stringify({ id: template.id, name: template.name, photoCount: template.photoCount })
    );
  };

  const handleConfirm = async () => {
    if (!selectedTemplate) return;
    
    if (sessionId) {
      try {
        await sessionRepository.updateTemplate({
          sessionId,
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
        });
        await sessionRepository.updateStage(sessionId, 'TEMPLATE_SELECTED');
      } catch (e) {
        console.error('Failed to update template in Firestore:', e);
      }
    }
    
    router.push('/camera');
  };

  const timerElement = (
    <div className="flex items-center justify-center rounded-full bg-red-50 px-3 py-1 border border-red-100 ml-2">
      <Typography variant="label" className="text-red-600 font-bold tracking-widest text-sm">
        {formatTime(sessionTimeLeft)}
      </Typography>
    </div>
  );

  const renderTemplateGrid = (items: TemplateCard[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((tpl) => {
        const selected = tpl.id === selectedTemplateId;
        return (
          <motion.button
            key={tpl.id}
            type="button"
            onClick={() => handleSelect(tpl)}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={
              `relative flex flex-col overflow-hidden rounded-3xl border p-0 text-left transition-all duration-200 group ` +
              (selected
                ? 'border-[#E83E8C] bg-[#E83E8C]/5 shadow-[0_0_20px_rgba(232,62,140,0.15)] ring-2 ring-[#E83E8C]'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100')
            }
          >
            <div className="h-64 flex items-center justify-center bg-gray-200 overflow-hidden relative">
              {tpl.imageUrl ? (
                <img 
                  src={tpl.imageUrl} 
                  alt={tpl.name} 
                  className="w-full h-full object-contain bg-white transition-transform duration-300 group-hover:scale-105" 
                />
              ) : (
                <Camera size={32} className="opacity-30 text-gray-500" />
              )}
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-lg font-semibold text-black">{tpl.name}</p>
                {tpl.tag ? (
                  <span className="rounded-full bg-[#E83E8C] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                    {tpl.tag}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-black/60">{tpl.photoCount} foto per sesi</p>
            </div>

            {selected && (
              <div className="pointer-events-none absolute inset-0 rounded-3xl border-2 border-[#E83E8C]" />
            )}
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <MainLayout step={3} footerHint="Pilih template yang Anda sukai untuk mulai berfoto" headerLeftElement={timerElement}>
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 px-4 py-6">
        <PageTitle
          title="Pilih Template"
          subtitle="Pilih frame yang paling sesuai dengan suasana foto Anda."
        />

        {loading ? (
          <div className="flex justify-center py-10">
            <Typography variant="body" className="text-black/50">Memuat template...</Typography>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {/* Section 1: Tutorial UPI */}
            {upiCards.length > 0 && (
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-pink-200 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-2 rounded-full bg-[#E83E8C]" />
                    <div>
                      <h2 className="text-xl font-bold text-black flex items-center gap-2">
                        Tutorial UPI
                        <span className="rounded-full bg-[#E83E8C]/10 text-[#E83E8C] px-2.5 py-0.5 text-xs font-semibold">
                          {upiCards.length} Template
                        </span>
                      </h2>
                      <p className="text-xs text-black/50">Template eksklusif sesi Tutorial UPI</p>
                    </div>
                  </div>
                </div>
                {renderTemplateGrid(upiCards)}
              </section>
            )}

            {/* Section 2: Template Lainnya */}
            {otherCards.length > 0 && (
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-2 rounded-full bg-gray-400" />
                    <div>
                      <h2 className="text-xl font-bold text-black flex items-center gap-2">
                        Template Lainnya
                        <span className="rounded-full bg-gray-100 text-gray-600 px-2.5 py-0.5 text-xs font-semibold">
                          {otherCards.length} Template
                        </span>
                      </h2>
                      <p className="text-xs text-black/50">Koleksi template umum</p>
                    </div>
                  </div>
                </div>
                {renderTemplateGrid(otherCards)}
              </section>
            )}
          </div>
        )}

        <Card className="rounded-3xl border border-gray-200 bg-gray-50 p-5 mt-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Typography variant="label" className="text-black/50 uppercase tracking-[0.25em]">
                Pilih Template
              </Typography>
              <Typography variant="body" className="mt-2 text-black/70 leading-relaxed">
                {selectedTemplate
                  ? `Template dipilih: ${selectedTemplate.name}`
                  : loading
                  ? 'Memuat template...'
                  : 'Pilih salah satu template untuk melanjutkan ke sesi foto.'}
              </Typography>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <PrimaryButton size="md" fullWidth disabled={!selectedTemplate} onClick={handleConfirm}>
                <Check size={16} />
                {selectedTemplate ? 'Lanjut ke Kamera' : 'Pilih template terlebih dahulu'}
              </PrimaryButton>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}

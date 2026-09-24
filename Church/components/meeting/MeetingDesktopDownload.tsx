import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, Download, Monitor, ShieldAlert, FileDown, MoreHorizontal } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { LogoIcon } from '../icons/Icons';

const BASE = '/api/downloads/meeting-desktop/';

/** What `latest.json` in the download folder describes. */
interface DesktopRelease {
  version: string;
  file: string;
  size: number;
  /** The program inside the zip, as Windows names it when it is opened. */
  exe?: string;
  /** The installer, when one is published: offered first. */
  setup?: { file: string; size: number; exe: string };
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

const isWindows = () => typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) && !/Windows Phone/i.test(navigator.userAgent);

/** The thing to click in an illustration. */
const Target: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <span className={`relative inline-flex rounded ring-2 ring-offset-2 ring-amber-400 ${className}`}>{children}</span>
);

/** Step 1: the browser's download panel, "Keep" in the ⋯ menu. */
const BrowserKeepShot: React.FC<{ file: string }> = ({ file }) => (
  <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-3 text-[12px] text-gray-700 shadow-md">
    <div className="mb-2 font-semibold text-gray-900">下載</div>
    <div className="flex items-start gap-2.5 rounded-md bg-gray-50 p-2">
      <FileDown size={18} className="mt-0.5 shrink-0 text-gray-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-900">{file}</div>
        <div className="mt-0.5 text-amber-700">通常不會下載此檔案。請先確認您信任它再開啟。</div>
      </div>
      <MoreHorizontal size={16} className="shrink-0 text-gray-500" />
    </div>
    <div className="ml-auto mt-1.5 w-28 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
      <div className="px-3 py-1 text-gray-500">刪除</div>
      <div className="px-2 py-0.5"><Target className="w-full px-1 py-0.5 font-semibold text-gray-900">保留</Target></div>
      <div className="px-3 py-1 text-gray-500">回報此檔案安全</div>
    </div>
  </div>
);

/** Step 2: Windows SmartScreen, before and after "More info". */
const SmartScreenShot: React.FC<{ file: string }> = ({ file }) => {
  const frame = 'flex min-h-[10.5rem] w-full flex-col rounded-sm bg-[#0063b1] p-3.5 text-[11px] leading-snug text-white shadow-md sm:w-60';
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className={frame}>
        <div className="flex items-center gap-1.5 text-[15px] font-light"><ShieldAlert size={16} />Windows 已保護您的電腦</div>
        <p className="mt-2 text-white/90">Microsoft Defender SmartScreen 已防止無法辨識的應用程式啟動。執行此應用程式可能會讓您的電腦暴露在風險之中。</p>
        <div className="mt-2"><Target className="underline">其他資訊</Target></div>
        <div className="mt-auto flex justify-end pt-3"><span className="border border-white/70 px-3 py-0.5">不要執行</span></div>
      </div>
      <ChevronRight size={20} className="hidden shrink-0 self-center text-gray-400 sm:block" />
      <div className={frame}>
        <div className="flex items-center gap-1.5 text-[15px] font-light"><ShieldAlert size={16} />Windows 已保護您的電腦</div>
        <p className="mt-2 text-white/90">應用程式：<span className="break-all">{file}</span><br />發行者：未知的發行者</p>
        <div className="mt-auto flex justify-end gap-2 pt-3">
          <Target><span className="border border-white/70 bg-white/10 px-3 py-0.5">仍要執行</span></Target>
          <span className="border border-white/70 px-3 py-0.5">不要執行</span>
        </div>
      </div>
    </div>
  );
};

/** Step 3: the app itself, signed in for good. */
const AppShot: React.FC = () => (
  <div className="flex w-44 flex-col items-center rounded-xl border border-gray-200 bg-gradient-to-b from-sky-50 to-white px-4 pb-4 pt-5 shadow-md">
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><LogoIcon className="h-5 w-5" /></span>
    <span className="mt-2 text-xs font-bold text-gray-900">線上聚會</span>
    <span className="mt-2.5 h-5 w-full rounded-md border border-gray-200 bg-gray-50" />
    <span className="mt-1.5 h-5 w-full rounded-md border border-gray-200 bg-gray-50" />
    <span className="mt-2.5 flex h-6 w-full items-center justify-center rounded-md bg-blue-600 text-[10px] font-semibold text-white">登入</span>
  </div>
);

/**
 * The Windows app, offered under the room cards. The version comes from the
 * download folder's manifest, so publishing a new build needs no site change;
 * with no manifest (or no network) the section simply does not appear.
 */
export const MeetingDesktopDownload: React.FC = () => {
  const { t } = useLocalization();
  const [release, setRelease] = useState<DesktopRelease | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const windows = isWindows();

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}latest.json`)
      .then((res) => (res.ok ? res.json() as Promise<DesktopRelease> : null))
      .then((data) => { if (!cancelled && data?.file) setRelease(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!release) return null;
  const features = ['meeting.dlFeatureAgenda', 'meeting.dlFeatureShare', 'meeting.dlFeatureToolbar', 'meeting.dlFeaturePrompts', 'meeting.dlFeatureSignIn'];
  const steps: [string, React.ReactNode][] = [
    ['meeting.dlStepKeep', <BrowserKeepShot file={release.file} />],
    ['meeting.dlStepRunAnyway', <SmartScreenShot file={release.setup?.exe ?? release.exe ?? release.file} />],
    ['meeting.dlStepOnce', <AppShot />],
  ];

  return (
    <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:mt-14 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/25">
            <LogoIcon className="h-6 w-6" />
          </span>
          <h3 className="text-lg font-bold text-gray-900 sm:text-xl">{t('meeting.dlTitle')}</h3>
        </div>
        <span className="text-sm text-gray-400">v{release.version}</span>
      </div>

      <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">{t('meeting.dlSubtitle')}</p>
          <ul className="mt-3 space-y-2">
            {features.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm text-gray-700">
                <Check size={17} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald-600" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        {/* To the right of the description: the installer first, the no-install copy beside it. */}
        <div className="flex shrink-0 flex-col gap-2.5 md:w-64">
          {windows ? (
            <>
              {release.setup && (
                <a href={`${BASE}${encodeURIComponent(release.setup.file)}`} download
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-blue-700">
                  <Download size={18} />
                  {t('meeting.dlButtonSetup')}
                </a>
              )}
              {release.setup && <p className="-mt-1 text-center text-xs text-gray-400">{t('meeting.dlSetupHint')} · {t('meeting.dlAbout')} {mb(release.setup.size)}MB</p>}
              <a href={`${BASE}${encodeURIComponent(release.file)}`} download
                className={release.setup
                  ? 'flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50'
                  : 'flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-blue-700'}>
                <Download size={release.setup ? 16 : 18} />
                {t(release.setup ? 'meeting.dlButtonPortable' : 'meeting.dlButton')}
              </a>
              <p className="-mt-1 text-center text-xs text-gray-400">
                {release.setup ? `${t('meeting.dlPortableHint')} · ` : ''}{t('meeting.dlAbout')} {mb(release.size)}MB
              </p>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-600">
              <Monitor size={18} className="mt-px shrink-0" />
              {t('meeting.dlWindowsOnly')}
            </div>
          )}
          <p className="text-center text-xs text-gray-500">{t('meeting.dlRequirement')}</p>
        </div>
      </div>

      {windows && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
            className="flex items-center gap-1.5 text-left text-sm font-semibold text-gray-700 hover:text-blue-700"
          >
            <ChevronRight size={16} className={`shrink-0 text-gray-400 transition-transform ${helpOpen ? 'rotate-90' : ''}`} />
            {t('meeting.dlHelpTitle')}
          </button>
          {helpOpen && (
            <ol className="mt-4 space-y-6 pl-6">
              {steps.map(([key, shot], i) => (
                <li key={key} className="space-y-2.5">
                  <p className="text-sm text-gray-700">
                    <span className="mr-1.5 font-semibold text-blue-700">{'①②③'[i]}</span>
                    {t(key)}
                  </p>
                  <figure className="rounded-xl bg-gray-50 p-4">
                    {shot}
                    <figcaption className="mt-2 text-[11px] text-gray-400">{t('meeting.dlIllustration')}</figcaption>
                  </figure>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
};

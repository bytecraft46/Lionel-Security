import React, { useState } from 'react';
import { Download, ExternalLink, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../ui';

const APK_URL =
  'https://github.com/bytecraft46/Lionel-Security/releases/latest/download/DutyDesk-Android.apk';
const RELEASE_URL = 'https://github.com/bytecraft46/Lionel-Security/releases/latest';

export default function ApkDownloadButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost btn-sm"
        title="Download the DutyDesk Android app"
      >
        <Smartphone size={14} />
        <span className="hidden text-[10px] font-bold uppercase tracking-wider xl:inline">
          Download APK
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="DutyDesk Android app"
        subtitle="Scan the QR code on a phone or download the APK directly."
      >
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <QRCodeSVG value={APK_URL} size={188} level="M" includeMargin={false} />
          </div>

          <p className="text-center text-[11px] leading-relaxed text-muted">
            Scan with an Android camera, then allow &ldquo;Install unknown apps&rdquo; when
            prompted.
          </p>

          <a
            href={APK_URL}
            className="btn btn-primary w-full justify-center py-2.5 text-xs"
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} />
            Download APK
          </a>

          <a
            href={RELEASE_URL}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={11} />
            View release on GitHub
          </a>

          <p className="max-w-full break-all text-center font-mono text-[10px] text-muted">
            {APK_URL}
          </p>
        </div>
      </Modal>
    </>
  );
}

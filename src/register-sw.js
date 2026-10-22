const manifest = {
  name: 'MVR Ledger',
  short_name: 'MVR Ledger',
  description: 'Money lending and repayment tracker',
  start_url: '/',
  display: 'standalone',
  background_color: '#05070b',
  theme_color: '#f7d361',
  icons: [
    {
      src: '/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    }
  ]
};

const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const link = document.createElement('link');
link.rel = 'manifest';
link.href = url;

if (!document.querySelector('link[rel="manifest"]')) {
  document.head.appendChild(link);
}

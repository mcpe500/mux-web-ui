// DISC-002..004 (spec 013): pure logic for Support Hub — badges, onboarding
// checklist, guide content. Kept framework-free for exhaustive vitest.
export interface ToolInfo {
  id: string;
  label: string;
  color: string;
  binary: string;
  found: boolean;
  package: string | null;
  installable: boolean;
  install_hint?: string;
}

export interface RouterStatus {
  running: boolean;
  port: number;
}

/// DISC-002: status badge of one coding-agent card.
export function agentBadge(
  tool: Pick<ToolInfo, 'found' | 'installable'>
): { text: string; color: string } {
  if (tool.found) return { text: '✅ Terpasang', color: '#10b981' };
  if (tool.installable) return { text: '⬇️ Belum terpasang — bisa di-install', color: '#f59e0b' };
  return { text: 'ℹ️ Install manual (lihat hint)', color: '#94a3b8' };
}

/// DISC-002: status badge of the 9Router gateway.
export function routerBadge(status: RouterStatus | null): { text: string; color: string } {
  if (!status) return { text: '… memeriksa', color: '#94a3b8' };
  return status.running
    ? { text: `🟢 Jalan di 127.0.0.1:${status.port}`, color: '#10b981' }
    : { text: `🔴 Mati (tidak ada yang listen di ${status.port})`, color: '#ef4444' };
}

export interface OnboardingInput {
  distrosInstalled: number;
  agentsFound: number;
  routerRunning: boolean;
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  cta: string | null;
}

/// DISC-004: first-run checklist. Every state combination yields correct CTAs.
export function buildOnboarding(input: OnboardingInput): OnboardingStep[] {
  return [
    {
      key: 'distro',
      label: 'Pasang satu distro proot (mis. Ubuntu) untuk lingkungan Linux lengkap',
      done: input.distrosInstalled > 0,
      cta: input.distrosInstalled > 0 ? null : 'Buka Manajemen Distro',
    },
    {
      key: 'agent',
      label: 'Install minimal satu coding agent (OpenCode / Claude Code / Codex)',
      done: input.agentsFound > 0,
      cta: input.agentsFound > 0 ? null : 'Install Agent',
    },
    {
      key: 'router9',
      label: '(Opsional) Jalankan 9Router — fallback AI 3-tier, kuota tidak terbuang',
      done: input.routerRunning,
      cta: input.routerRunning ? null : 'Install 9Router',
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): string {
  const done = steps.filter((s) => s.done).length;
  return `${done}/${steps.length}`;
}

/// DISC-003: step-by-step "How to use" guides shown inline in the hub.
export interface Guide {
  id: string;
  title: string;
  steps: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'distro',
    title: '🐧 Cara pakai proot-distro (Linux di dalam Termux)',
    steps: [
      'Buka bagian "Distro" di bawah — lihat daftar distro yang tersedia.',
      'Klik Install pada distro pilihan (Ubuntu paling ramah pemula). Tunggu progress selesai.',
      'Setelah terpasang, buka Terminal baru lalu pilih env distro di chip environment — kamu sekarang di dalam Linux.',
      'Folder HOME Termux (/sdcard juga) tetap bisa diakses dari dalam distro.',
    ],
  },
  {
    id: 'agents',
    title: '🤖 Cara pakai Coding Agents (OpenCode, Claude Code, Codex, dll)',
    steps: [
      'Pastikan Node.js ada (installer di halaman ini otomatis mengecek dan memberi tahu kalau belum ada).',
      'Klik Install pada kartu agent pilihan — progress live muncul langsung.',
      'Setelah badge berubah ✅ Terpasang, buka Editor lalu klik tombol 🤖 untuk meluncurkan agent di folder kerja mana pun.',
      'Judul tab akan menandai sesi agent, mis. [codex@ubuntu].',
    ],
  },
  {
    id: 'router9',
    title: '🛜 Cara connect 9Router (fallback AI 3-tier, 60+ provider)',
    steps: [
      'Klik Install pada kartu 9Router (npm i -g 9router dijalankan di env terpilih).',
      'Jalankan perintah 9router di terminal — dashboard terbuka di http://127.0.0.1:20128/dashboard.',
      'Hubungkan provider (OAuth atau API key) dari dashboard 9Router.',
      'Kembali ke sini — badge berubah 🟢 dan Model Selector otomatis terisi model dari router.',
    ],
  },
  {
    id: 'config',
    title: '⚙️ Cara edit config agent & arahkan ke 9Router',
    steps: [
      'Pilih agent di bagian Config & Models (Codex → config.toml, Claude Code → settings.json, OpenCode → opencode.json).',
      'Klik "Route via 9Router" untuk mengarahkan endpoint agent ke http://127.0.0.1:<port>/v1 secara sekali klik.',
      'Edit isi config manual bila perlu — backup .bak dibuat otomatis sebelum tiap simpan.',
      'Pilih model dari dropdown (daftar datang dari 9Router /v1/models).',
    ],
  },
];

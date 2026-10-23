const status = document.querySelector('#release-status');
const retry = document.querySelector('#retry');
const cards = [...document.querySelectorAll('[data-platform]')];
document.querySelector('#year').textContent = String(new Date().getFullYear());

function architecture(name) {
  if (/(?:aarch64|arm64)/i.test(name)) return 'ARM64';
  if (/(?:x86_64|amd64|x64)/i.test(name)) return 'x64';
  if (/(?:i686|ia32|x86)(?:[_.-]|$)/i.test(name)) return 'x86';
  if (/universal/i.test(name)) return 'Universal';
  return 'Arquitetura na release';
}

function classify(name) {
  if (/\.dmg$/i.test(name)) return 'mac';
  if (/\.(?:exe|msi)$/i.test(name)) return 'windows';
  if (/\.(?:appimage|deb|rpm)$/i.test(name)) return 'linux';
  return null;
}

async function loadDownloads() {
  retry.hidden = true;
  status.textContent = 'Consultando os instaladores publicados…';
  for (const card of cards) {
    card.classList.remove('recommended');
    const pending = document.createElement('span');
    pending.className = 'pending';
    pending.textContent = 'Aguardando publicação';
    card.querySelector('.download-list').replaceChildren(pending);
  }
  try {
    const configResponse = await fetch('./config.json', { signal: AbortSignal.timeout(10000) });
    if (!configResponse.ok) throw new Error('config');
    const { repository } = await configResponse.json();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) {
      status.textContent = 'Os downloads serão disponibilizados após a publicação do repositório e da primeira release.';
      return;
    }
    const repoUrl = `https://github.com/${repository}`;
    for (const link of document.querySelectorAll('[data-repo]')) {
      link.href = repoUrl;
      link.hidden = false;
    }
    const releasesLink = document.querySelector('[data-releases]');
    releasesLink.href = `${repoUrl}/releases`;
    releasesLink.hidden = false;
    const sourceLink = document.querySelector('[data-source]');
    sourceLink.href = `${repoUrl}/archive/HEAD.zip`;
    sourceLink.hidden = false;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('releases');
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('format');
    const published = releases.filter(release => !release.draft);
    const release = published.find(release => !release.prerelease) ?? published[0];
    if (!release) {
      status.textContent = 'A primeira versão ainda não foi publicada. Acompanhe as novidades no GitHub.';
      return;
    }
    let count = 0;
    for (const card of cards) {
      const platform = card.dataset.platform;
      const assets = (release.assets ?? []).filter(asset => classify(asset.name) === platform &&
        typeof asset.browser_download_url === 'string' && asset.browser_download_url.startsWith(`${repoUrl}/releases/download/`));
      if (!assets.length) continue;
      count += assets.length;
      card.querySelector('.download-list').replaceChildren(...assets.map(asset => {
        const link = document.createElement('a');
        link.href = asset.browser_download_url;
        const arch = architecture(asset.name);
        const format = asset.name.split('.').at(-1);
        const label = platform === 'mac' && arch === 'ARM64' ? 'Apple Silicon' : platform === 'mac' && arch === 'x64' ? 'Intel' : arch;
        link.textContent = `Baixar · ${label} · ${format}`;
        link.setAttribute('aria-label', `Baixar ${asset.name}`);
        return link;
      }));
    }
    const platform = /Mac/i.test(navigator.platform) ? 'mac' : /Win/i.test(navigator.platform) ? 'windows' : /Linux/i.test(navigator.platform) ? 'linux' : '';
    const current = cards.find(card => card.dataset.platform === platform);
    if (current?.querySelector('a')) current.classList.add('recommended');
    status.textContent = `${release.tag_name}${release.prerelease ? ' · Prévia experimental' : ''} · ${count ? 'Instaladores publicados abaixo.' : 'Esta versão ainda não possui instaladores.'}`;
  } catch {
    status.textContent = 'Não foi possível consultar os downloads. Tente novamente ou confira todas as versões no GitHub.';
    retry.hidden = false;
    for (const pending of document.querySelectorAll('.pending')) pending.textContent = 'Consulta indisponível';
  }
}
retry.addEventListener('click', loadDownloads);
loadDownloads();

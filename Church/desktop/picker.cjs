let selected = null;
const shareButton = document.getElementById('share');
const audio = document.getElementById('audio');
const choose = id => window.capturePicker.choose(id ? { id, audio: audio.checked } : null);
const select = (id, button) => {
  selected = id;
  for (const other of document.querySelectorAll('.source')) other.classList.toggle('selected', other === button);
  shareButton.disabled = false;
};

function section(title, sources) {
  if (!sources.length) return null;
  const heading = document.createElement('h2');
  heading.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const source of sources) {
    const button = document.createElement('button');
    button.className = 'source';
    button.type = 'button';
    button.dataset.name = source.name;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (source.thumbnail) {
      const image = document.createElement('img');
      image.src = source.thumbnail;
      image.alt = '';
      thumb.append(image);
    }
    const label = document.createElement('div');
    label.className = 'label';
    if (source.icon) {
      const icon = document.createElement('img');
      icon.src = source.icon;
      icon.alt = '';
      label.append(icon);
    }
    const text = document.createElement('span');
    text.textContent = source.name;
    label.append(text);
    button.append(thumb, label);
    button.onclick = () => select(source.id, button);
    button.ondblclick = () => choose(source.id);
    grid.append(button);
  }
  const wrapper = document.createElement('section');
  wrapper.append(heading, grid);
  return wrapper;
}

window.capturePicker.list().then(({ sources, audio: audioRequested }) => {
  const main = document.getElementById('main');
  main.textContent = '';
  const screens = sources.filter(source => source.screen).map((source, index, all) => ({ ...source, name: all.length > 1 ? `螢幕 ${index + 1}` : '整個螢幕' }));
  const windows = sources.filter(source => !source.screen);
  for (const part of [section('螢幕', screens), section('視窗', windows)]) if (part) main.append(part);
  if (!sources.length) main.innerHTML = '<div class="empty">找不到可分享的畫面</div>';
  document.getElementById('audio-row').hidden = !audioRequested;
  // Like Zoom, the first screen is ready to share with one click.
  const first = main.querySelector('.source');
  if (first) { first.click(); first.focus(); }
});
shareButton.onclick = () => { if (selected) choose(selected); };
document.getElementById('cancel').onclick = () => choose(null);
document.getElementById('close').onclick = () => choose(null);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') choose(null);
  else if (event.key === 'Enter' && selected) { event.preventDefault(); choose(selected); }
});

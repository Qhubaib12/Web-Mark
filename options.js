const fields = [
  'enabled',
  'showUrl',
  'showDate',
  'showTime',
  'showCountry',
  'showIp',
  'showViewport',
  'showUserAgent',
  'timezone',
  'manualCountry',
  'theme',
  'screenshotType'
];

const defaults = {
  enabled: true,
  showUrl: true,
  showDate: true,
  showTime: true,
  showCountry: true,
  showIp: false,
  showViewport: false,
  showUserAgent: false,
  timezone: 'auto',
  manualCountry: '',
  theme: 'light',
  screenshotType: 'visible'
};

const populateTimezones = () => {
  const select = document.getElementById('timezone');
  const allTimezones = Intl.supportedValuesOf('timeZone');
  allTimezones.forEach(tz => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.textContent = tz.replace(/_/g, ' ');
    select.appendChild(opt);
  });
};

const save = () => {
  const data = {};
  fields.forEach(f => {
    const el = document.getElementById(f);
    data[f] = el.type === 'checkbox' ? el.checked : el.value;
  });
  chrome.storage.sync.set(data, () => {
    const status = document.getElementById('status');
    status.innerText = "Saved Successfully!";
    setTimeout(() => { status.innerText = ""; }, 1500);
  });
};

const load = () => {
  populateTimezones();
  chrome.storage.sync.get(fields, (items) => {
    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el.type === 'checkbox') {
        el.checked = items[f] ?? defaults[f];
      } else {
        el.value = items[f] || defaults[f];
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', load);
document.querySelectorAll('input, select').forEach(el => el.onchange = save);

// The account panel: sign in / create an account (username + password, no e-mail), then
// friends (online status, join their lobby), friend requests, saved games with friends,
// and the story save that follows your account to any device.
import { account, cleanName, nameError } from '../net/account.js';
import { audio } from '../audio/audio.js';
import { formatMoney } from '../core/util.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (t) => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

export function accountPanel(ui, cb) {
  const body = h('<div class="acc"></div>');
  body.addEventListener('keydown', (e) => e.stopPropagation());
  let tab = 'in', msg = '', busy = false, addMsg = '';

  const authView = () => {
    body.innerHTML = `
      <div class="acc-tabs"><button data-t="in" class="${tab === 'in' ? 'on' : ''}">Sign in</button><button data-t="new" class="${tab === 'new' ? 'on' : ''}">Create account</button></div>
      <p class="acc-lead">${tab === 'in' ? 'Welcome back. Your story save, your friends and your shops with them come with you.' : 'Just a username and a password — no e-mail. Your friends add you by your username.'}</p>
      <label class="acc-f"><span>Username</span><input class="a-name" maxlength="15" autocomplete="username" placeholder="e.g. fadeking" spellcheck="false"></label>
      <label class="acc-f"><span>Password</span><input class="a-pw" type="password" maxlength="64" autocomplete="${tab === 'in' ? 'current-password' : 'new-password'}"></label>
      ${tab === 'new' ? '<label class="acc-f"><span>Password again</span><input class="a-pw2" type="password" maxlength="64" autocomplete="new-password"></label>' : ''}
      <label class="acc-chk"><input type="checkbox" class="a-rem" checked><span>Stay signed in on this device</span></label>
      <div class="acc-err">${esc(msg)}</div>
      <button class="acc-go">${busy ? 'One moment…' : tab === 'in' ? 'Sign in' : 'Create account'}</button>
      ${tab === 'new' ? '<p class="acc-note">There is no e-mail, so a forgotten password can’t be reset. Write it down. Your password never leaves this device; your account data is stored encrypted.</p>' : ''}`;
    body.querySelectorAll('.acc-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; msg = ''; audio.click(); render(); }));
    const name = body.querySelector('.a-name');
    name.addEventListener('input', () => { name.value = name.value.toLowerCase().replace(/[^a-z0-9]/g, ''); });
    const go = async () => {
      if (busy) return;
      const n = cleanName(name.value), pw = body.querySelector('.a-pw').value;
      const err = nameError(n);
      if (err) { msg = err; render(); return; }
      if (tab === 'new' && pw !== body.querySelector('.a-pw2').value) { msg = 'The passwords don’t match.'; render(); return; }
      busy = true; msg = ''; render();
      body.querySelector('.a-name').value = n;
      try {
        if (tab === 'new') { await account.register(n, pw); if (body.querySelector('.a-rem')?.checked !== false) await account.login(n, pw, true); }
        else await account.login(n, pw, body.querySelector('.a-rem')?.checked !== false);
        audio.purchase?.();
        cb.onSignedIn?.();
      } catch (e) { msg = e.message || 'Something went wrong.'; }
      busy = false; render();
    };
    body.querySelector('.acc-go').addEventListener('click', go);
    body.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
    setTimeout(() => name.focus(), 50);
  };

  const meView = () => {
    const d = account.data;
    const friends = d.friends.map((f) => {
      const p = account.presence.get(f), on = account.online(f);
      const lobby = on && p?.lobby;
      return `<div class="acc-fr ${on ? 'on' : ''}"><i></i><div class="nm"><b>${esc(f)}</b><small>${lobby ? `in a lobby · ${esc(p.lobby)}` : on ? `online · Lv ${p.lvl || 1}` : `offline · ${ago(p?.at)}`}</small></div>
        ${lobby ? `<button class="join" data-c="${esc(p.lobby)}">Join</button>` : ''}<button class="rm" data-f="${esc(f)}" title="Remove">×</button></div>`;
    }).join('') || '<p class="acc-empty">No friends yet. Add someone by their username.</p>';
    const reqs = [...account.requests.keys()].map((f) => `<div class="acc-req"><span><b>${esc(f)}</b> added you</span><button class="ok" data-f="${esc(f)}">Add back</button><button class="no" data-f="${esc(f)}">Dismiss</button></div>`).join('');
    const teams = account.teams().map((t) => {
      const others = t.members.filter((m) => m !== account.user);
      return `<div class="acc-team"><div><b>${others.length ? others.map(esc).join(' & ') : 'Just you'}</b><small>Day ${t.s?.day || 1} · ${formatMoney(t.s?.money || 0)} · ${(t.s?.owned || []).length} upgrades · ${ago(t.at)}</small></div><button class="host" data-k="${esc(t.k)}">Host</button></div>`;
    }).join('') || '<p class="acc-empty">Play online with friends and your shop together is saved here — load it again whenever the same group plays.</p>';
    const sv = d.save;
    body.innerHTML = `
      <div class="acc-me"><div class="av">${esc(account.user[0].toUpperCase())}</div><div><b>${esc(account.user)}</b><small>Signed in · story save ${sv ? `Day ${sv.day} · Lv ${sv.level}` : 'not uploaded yet'}</small></div><button class="acc-out">Sign out</button></div>
      ${reqs ? `<h4>Friend requests</h4>${reqs}` : ''}
      <h4>Friends</h4>
      <div class="acc-add"><input class="a-add" maxlength="15" placeholder="Add a friend by username" spellcheck="false"><button class="a-addb">Add</button></div>
      <div class="acc-msg">${esc(addMsg)}</div>
      <div class="acc-frs">${friends}</div>
      <h4>Saved games with friends</h4>
      ${teams}
      ${sv && cb.canLoadSave?.() ? `<h4>Story save</h4><div class="acc-team"><div><b>Your account’s story save</b><small>Day ${sv.day} · Lv ${sv.level} · ${formatMoney(sv.money)} · ${ago(d.savedAt)}</small></div><button class="load">Load</button></div>` : ''}`;
    body.querySelector('.acc-out').addEventListener('click', () => { account.logout(); audio.back?.(); cb.onSignedOut?.(); render(); });
    const add = body.querySelector('.a-add');
    add.addEventListener('input', () => { add.value = add.value.toLowerCase().replace(/[^a-z0-9]/g, ''); });
    const doAdd = async () => {
      const n = add.value; if (!n) return;
      addMsg = 'Looking for ' + n + '…'; render();
      try { await account.addFriend(n); addMsg = `${n} added. They’ll see a friend request.`; audio.purchase?.(); } catch (e) { addMsg = e.message; }
      render();
    };
    body.querySelector('.a-addb').addEventListener('click', doAdd);
    add.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    body.querySelectorAll('.rm').forEach((b) => b.addEventListener('click', () => { account.removeFriend(b.dataset.f); }));
    body.querySelectorAll('.acc-req .ok').forEach((b) => b.addEventListener('click', async () => { try { await account.addFriend(b.dataset.f); } catch (e) { addMsg = e.message; } render(); }));
    body.querySelectorAll('.acc-req .no').forEach((b) => b.addEventListener('click', () => account.dismiss(b.dataset.f)));
    body.querySelectorAll('.join').forEach((b) => b.addEventListener('click', () => cb.onJoin?.(b.dataset.c)));
    body.querySelectorAll('.host').forEach((b) => b.addEventListener('click', () => cb.onHost?.(b.dataset.k)));
    body.querySelector('.load')?.addEventListener('click', () => cb.onLoadSave?.());
  };

  const render = () => { if (!body.isConnected && rendered) { off(); return; } rendered = true; if (account.loggedIn) meView(); else authView(); };
  let rendered = false;
  const off = account.onChange(() => { if (account.loggedIn && !body.querySelector('input:focus')) render(); });
  render();
  ui.panel('Account', account.loggedIn ? 'Friends & Saves' : 'Your Account', body, () => off());
}

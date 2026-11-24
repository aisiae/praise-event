import { createVillage } from './scene.mjs';

const maximum = 23;
const ornamentLimit = 3;
const api = '/api/wish-tree-test';
const byId = id => document.getElementById(id);
const entry = byId('entry');
const plantDialog = byId('modal-plant');
const detailDialog = byId('modal-tree-detail');
const growthCells = byId('growth-cells');
const nearButton = byId('near-action');
const maxPreview = byId('max-preview');
const sampleTrees = [17, 10, 22, 6, 2].map((ownWater, slot) => ({ slot, ownWater, friendWater: [7, 5, 11, 3, 2][slot] }));
const empty = () => ({ trees: [], mine: null, targets: [], watered: [] });
const growthOf = tree => Math.min(maximum, tree?.ownWater ?? 0);
const treeAt = slot => garden.trees.find(tree => tree.slot === slot);

let mode = 'demo';
let garden = { ...empty(), trees: sampleTrees };
let preview = false;
let busy = false;
let nearby = -1;
let selected = -1;
let lastActionLabel = '';
let canPlay = false;

const directions = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
};

for (let day = 1; day <= maximum; day++) {
    const cell = document.createElement('span');
    cell.setAttribute('aria-hidden', 'true');
    growthCells.append(cell);
}

function toast(message) {
    const item = document.createElement('span');
    item.className = 'glass-panel toast';
    item.textContent = message;
    byId('toast-container').replaceChildren(item);
    setTimeout(() => item.remove(), 3200);
}

function targetsFor(trees, ownSlot) {
    const choices = trees.map(tree => tree.slot).filter(slot => slot !== ownSlot);
    const targets = [];
    while (targets.length < ornamentLimit && choices.length) {
        const index = Math.floor(Math.random() * choices.length);
        targets.push(choices.splice(index, 1)[0]);
    }
    return targets;
}

function actionFor(slot) {
    const tree = treeAt(slot);
    if (!tree) return garden.mine ? null : { action: 'plant', label: '🌱 소원 나무 심기', color: 'emerald' };
    if (slot === garden.mine?.slot) {
        if (growthOf(tree) >= maximum) return { label: '성장 완료' };
        if (garden.watered.includes(slot)) return { label: '오늘 물주기 완료 ✓' };
        return { action: 'water', label: '💧 소원 나무에 물주기', color: 'sky' };
    }
    if (garden.watered.includes(slot)) return { label: '오늘 장식 달기 완료 ✓' };
    if (!garden.targets.includes(slot)) return { label: '오늘의 장식 대상이 아닙니다' };
    return { action: 'decorate', label: '🎁 장식 달아주기', color: 'amber' };
}

function showNearby(slot) {
    nearby = slot;
    const action = slot < 0 || !canPlay || preview ? null : actionFor(slot);
    const label = action?.action ? action.label : '';
    if (label === lastActionLabel) return;
    lastActionLabel = label;
    nearButton.hidden = !label;
    nearButton.textContent = label;
    nearButton.className = 'action ' + (action?.color ?? '');
}

function syncView() {
    const own = treeAt(garden.mine?.slot);
    const shownGrowth = preview ? maximum : growthOf(own);
    const remaining = garden.targets.filter(slot => !garden.watered.includes(slot)).length;
    byId('player-label').textContent = mode === 'demo'
        ? '조작 체험 · 나무 자리 ' + village.capacity + '개'
        : '직원 참여 · 나무 자리 ' + village.capacity + '개';
    byId('my-tree-status').textContent = own ? (growthOf(own) === maximum ? '성장 완료' : '성장 중') : '심기 가능';
    byId('ornament-count').textContent = remaining + ' / ' + ornamentLimit + '회';
    byId('growth').hidden = !own && !preview;
    const points = (own?.ownWater ?? 0) * 3 + (own?.ornamentsGiven ?? 0) + (own?.friendWater ?? 0);
    byId('growth-label').textContent = shownGrowth + ' / ' + maximum + '칸' + (own && !preview ? ' · ' + points + '점' : '');
    growthCells.setAttribute('aria-valuenow', String(shownGrowth));
    Array.from(growthCells.children).forEach((cell, index) => cell.classList.toggle('filled', index < shownGrowth));
    byId('leave').hidden = false;
    byId('leave').textContent = mode === 'demo' ? '직원 로그인' : '로그아웃';
    byId('next-day').hidden = mode !== 'demo' || !own || preview;
    maxPreview.hidden = false;
    maxPreview.textContent = preview ? '최대 성장 미리보기 닫기' : '23일 최대 성장 미리보기';
    maxPreview.setAttribute('aria-pressed', String(preview));

    const previewSlot = garden.mine?.slot ?? 10;
    const trees = preview
        ? [...garden.trees.filter(tree => tree.slot !== previewSlot), { slot: previewSlot, ownWater: maximum, friendWater: 40 }]
        : garden.trees;
    village.updateTrees(trees, garden.mine);
    showNearby(nearby);
    if (detailDialog.open) renderDetail();
}

function setSceneEnabled() {
    canPlay = ![entry, plantDialog, detailDialog].some(dialog => dialog.open);
    village.setEnabled(canPlay);
    showNearby(nearby);
}

function showDialog(dialog) {
    const error = dialog.querySelector('[role="alert"]');
    if (error) error.hidden = true;
    if (!dialog.open) dialog.showModal();
    setSceneEnabled();
}

function pick(slot) {
    if (preview || busy || slot < 0) return;
    selected = slot;
    if (treeAt(slot)) {
        renderDetail();
        showDialog(detailDialog);
    } else if (!garden.mine) {
        byId('wish-input').value = '';
        showDialog(plantDialog);
    } else {
        toast('이미 내 소원 나무를 심었어요.');
    }
}

function renderDetail() {
    const tree = treeAt(selected);
    if (!tree) {
        detailDialog.close();
        return;
    }
    const mine = selected === garden.mine?.slot;
    const action = actionFor(selected);
    byId('detail-owner').textContent = mine ? '내 소원 나무' : '동료의 소원 나무';
    byId('detail-stats').textContent = '성장 ' + growthOf(tree) + '/' + maximum + '칸 · 장식 ' + (tree.friendWater ?? 0) + '개';
    byId('detail-wish').textContent = mine ? garden.mine.wish : '';
    byId('detail-wish').hidden = !mine;
    const button = byId('detail-action');
    button.textContent = action.label;
    button.className = 'action ' + (action.color ?? 'quiet');
    button.disabled = !action.action || busy;
}

async function send(action) {
    const response = await fetch(api, action ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action)
    } : { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? '잠시 후 다시 시도해 주세요.');
    return data;
}

async function run(operation) {
    if (busy) return;
    busy = true;
    try {
        await operation();
    } catch (error) {
        const message = document.querySelector('dialog[open] [role="alert"]');
        if (message) {
            message.hidden = false;
            message.textContent = error.message;
        } else {
            toast(error.message);
        }
    } finally {
        busy = false;
        syncView();
    }
}

function tryAction(slot) {
    if (preview || busy || slot < 0) return;
    const action = actionFor(slot)?.action;
    if (action === 'plant') {
        pick(slot);
    } else if (action === 'water' || action === 'decorate') {
        void run(async () => {
            if (mode === 'live') {
                garden = await send({ action, slot });
            } else {
                const own = slot === garden.mine.slot;
                garden = {
                    ...garden, watered: [...garden.watered, slot],
                    trees: garden.trees.map(tree => {
                        if (tree.slot === slot) return {
                            ...tree,
                            ownWater: (tree.ownWater ?? 0) + Number(own),
                            friendWater: (tree.friendWater ?? 0) + Number(!own)
                        };
                        if (!own && tree.slot === garden.mine.slot) return { ...tree, ornamentsGiven: (tree.ornamentsGiven ?? 0) + 1 };
                        return tree;
                    })
                };
            }
            toast(action === 'water'
                ? '💧 물을 줬어요. 내 나무 성장 ' + growthOf(treeAt(slot)) + '/' + maximum + '칸'
                : '🎁 동료 나무에 장식을 달았어요!');
        });
    }
}

let village;
try {
    village = createVillage(byId('canvas-container'), { onPick: pick, onNear: showNearby });
} catch (error) {
    console.error(error);
    byId('loading-error').hidden = false;
    byId('loading-error').textContent = '3D 정원을 불러오지 못했어요. 페이지를 새로고침하거나 WebGL을 지원하는 브라우저로 열어 주세요.';
    byId('login-submit').disabled = byId('demo').disabled = true;
    entry.showModal();
    entry.addEventListener('cancel', event => event.preventDefault());
}

if (village) {
    syncView();
    setSceneEnabled();
    let restoreSession = true;
    void send().then(data => {
        if (!restoreSession || !data.signedIn) return;
        mode = 'live';
        garden = data;
        syncView();
    }).catch(() => {});

    setInterval(async () => {
        if (mode !== 'live' || document.hidden || busy) return;
        const atStart = garden;
        try {
            const data = await send();
            if (garden !== atStart || busy || mode !== 'live') return;
            if (data.signedIn) {
                garden = data;
                syncView();
            } else {
                mode = 'demo';
                garden = { ...empty(), trees: sampleTrees };
                preview = false;
                syncView();
                toast('로그인 시간이 만료되었어요.');
            }
        } catch { /* Keep the last shared garden during a temporary connection failure. */ }
    }, 8000);

    byId('leave').addEventListener('click', () => {
        if (mode === 'demo') {
            restoreSession = false;
            byId('loading-error').hidden = true;
            showDialog(entry);
        } else {
            void run(async () => {
                await send({ action: 'logout' });
                mode = 'demo';
                garden = { ...empty(), trees: sampleTrees };
                preview = false;
            });
        }
    });
    byId('login-form').addEventListener('submit', event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        void run(async () => {
            byId('loading-error').hidden = true;
            const data = await send({ action: 'login', ...fields });
            if (!data.signedIn) throw new Error('직원 로그인 정보를 확인해 주세요.');
            mode = 'live';
            garden = data;
            preview = false;
            entry.close();
        });
    });
    byId('demo').addEventListener('click', () => entry.close());
    byId('plant-form').addEventListener('submit', event => {
        event.preventDefault();
        const wish = byId('wish-input').value.trim();
        if (!wish) return;
        const slot = selected;
        restoreSession = false;
        void run(async () => {
            garden = mode === 'live'
                ? await send({ action: 'plant', slot, wish })
                : { ...garden, trees: [...garden.trees, { slot }], mine: { slot, wish }, targets: targetsFor(garden.trees, slot) };
            plantDialog.close();
            village.focus(slot);
            toast('🎄 나만의 소원 나무를 심었어요!');
        });
    });

    [entry, plantDialog, detailDialog].forEach(dialog => dialog.addEventListener('close', setSceneEnabled));
    document.querySelectorAll('[data-close]').forEach(button => {
        button.addEventListener('click', () => button.closest('dialog').close());
    });
    byId('detail-action').addEventListener('click', () => tryAction(selected));
    nearButton.addEventListener('click', () => tryAction(nearby));
    byId('btn-find-mine').addEventListener('click', () => {
        if (garden.mine) village.focus(garden.mine.slot);
        else toast('눈밭에 있는 빈 화단을 눌러 내 나무를 심어 보세요.');
    });
    byId('next-day').addEventListener('click', () => {
        if (busy || !garden.mine || mode !== 'demo') return;
        garden = { ...garden, watered: [], targets: targetsFor(garden.trees, garden.mine.slot) };
        syncView();
        toast('다음 테스트 날이에요. 다시 물을 줄 수 있어요.');
    });
    maxPreview.addEventListener('click', () => {
        if (busy) return;
        preview = !preview;
        if (preview) village.focus(garden.mine?.slot ?? 10);
        syncView();
    });
    byId('zoom-in').addEventListener('click', () => village.zoom(-3));
    byId('zoom-out').addEventListener('click', () => village.zoom(3));

    window.addEventListener('keydown', event => {
        if (event.target instanceof HTMLElement && event.target.matches('input, textarea')) return;
        if (event.code === 'KeyE' && !event.repeat && !entry.open && !plantDialog.open) {
            event.preventDefault();
            tryAction(detailDialog.open ? selected : nearby);
        }
        const direction = directions[event.code];
        if (!canPlay || !direction) return;
        event.preventDefault();
        village.setDirection(direction, true);
    });
    window.addEventListener('keyup', event => {
        const direction = directions[event.code];
        if (direction) village.setDirection(direction, false);
    });
    window.addEventListener('blur', () => {
        village.setEnabled(false);
        setSceneEnabled();
    });
    document.querySelectorAll('[data-direction]').forEach(button => {
        const direction = button.dataset.direction;
        button.addEventListener('pointerdown', event => {
            if (!canPlay) return;
            button.setPointerCapture(event.pointerId);
            village.setDirection(direction, true);
        });
        button.addEventListener('lostpointercapture', () => village.setDirection(direction, false));
        button.addEventListener('keydown', event => {
            if (event.code === 'Space' || event.code === 'Enter') village.setDirection(direction, true);
        });
        button.addEventListener('keyup', event => {
            if (event.code === 'Space' || event.code === 'Enter') village.setDirection(direction, false);
        });
        button.addEventListener('blur', () => village.setDirection(direction, false));
    });

    const joystick = byId('joystick');
    let joystickOrigin = null;
    joystick.addEventListener('pointerdown', event => {
        if (!canPlay || joystickOrigin) return;
        joystickOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId };
        joystick.setPointerCapture(event.pointerId);
    });
    joystick.addEventListener('pointermove', event => {
        if (joystickOrigin?.id !== event.pointerId) return;
        const dx = event.clientX - joystickOrigin.x;
        const dy = event.clientY - joystickOrigin.y;
        const length = Math.max(24, Math.hypot(dx, dy));
        village.setStick(dx / length, dy / length);
        joystick.style.setProperty('--dx', (dx / length * 24) + 'px');
        joystick.style.setProperty('--dy', (dy / length * 24) + 'px');
    });
    joystick.addEventListener('lostpointercapture', () => {
        joystickOrigin = null;
        village.setStick(0, 0);
        joystick.style.removeProperty('--dx');
        joystick.style.removeProperty('--dy');
    });
}

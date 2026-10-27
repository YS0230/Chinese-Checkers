import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getLegalMoves, type PublicRoomSummary, DEFAULT_ROOM_RULES } from '@starry/shared';
import { Board } from '../src/components/Board';
import { ConnectionBadge } from '../src/components/ConnectionBadge';
import { filterRooms } from '../src/lib/format';
import { GamePage } from '../src/pages/GamePage';
import { HomePage } from '../src/pages/HomePage';
import { LobbyPage } from '../src/pages/LobbyPage';
import { WaitingRoom } from '../src/pages/WaitingRoom';
import { mockClient, renderWithClient, twoPlayerGame } from './helpers';

const room = (over: Partial<PublicRoomSummary> = {}): PublicRoomSummary => ({
  code: 'ABCDEF',
  name: '星際對決',
  hostName: 'Alice',
  playerCount: 1,
  maxPlayers: 2,
  status: 'waiting',
  colors: [0],
  rules: DEFAULT_ROOM_RULES,
  createdAt: Date.now(),
  startedAt: null,
  joinable: true,
  ...over,
});

describe('首頁', () => {
  it('顯示主要操作按鈕，點擊建立房間開啟對話框', async () => {
    const client = mockClient();
    renderWithClient(<HomePage />, client);
    expect(screen.getByText('星際彈珠中國跳棋')).toBeInTheDocument();
    for (const label of ['開始遊戲・公開大廳', '建立房間', '加入房間', '遊戲規則']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /音效/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /開始遊戲/ }));
    expect(client.goLobby).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /建立房間/ }));
    expect(await screen.findByRole('dialog', { name: '建立房間' })).toBeInTheDocument();
  });

  it('透過邀請連結開啟時顯示加入對話框並帶入代碼', async () => {
    renderWithClient(<HomePage />, mockClient({ inviteCode: 'XYZ23456' }));
    const dialog = await screen.findByRole('dialog', { name: /受邀加入房間 XYZ23456/ });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('房間代碼')).toHaveValue('XYZ23456');
  });
});

describe('連線狀態', () => {
  it.each([
    ['connected', '已連線'],
    ['connecting', '連線中'],
    ['reconnecting', '重新連線中'],
    ['offline', '離線'],
  ] as const)('%s 顯示「%s」', (status, label) => {
    render(<ConnectionBadge status={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });
});

describe('公開大廳', () => {
  it('搜尋與人數篩選', () => {
    const rooms = [room(), room({ code: 'QWERTY', name: '六人大亂鬥', hostName: 'Bob', maxPlayers: 6, joinable: false })];
    expect(filterRooms(rooms, { query: '亂鬥', size: 0, joinableOnly: false }).map((r) => r.code)).toEqual(['QWERTY']);
    expect(filterRooms(rooms, { query: 'bob', size: 0, joinableOnly: false })).toHaveLength(1);
    expect(filterRooms(rooms, { query: '', size: 2, joinableOnly: false })).toHaveLength(1);
    expect(filterRooms(rooms, { query: '', size: 0, joinableOnly: true })).toHaveLength(1);
  });

  it('沒有房間時顯示空狀態', () => {
    renderWithClient(<LobbyPage />, mockClient({ view: 'lobby' }));
    expect(screen.getByTestId('lobby-empty')).toHaveTextContent('目前沒有公開房間');
  });

  it('載入中顯示骨架、離線時顯示連線提示', () => {
    const { unmount } = renderWithClient(<LobbyPage />, mockClient({ view: 'lobby', lobbyLoading: true }));
    expect(screen.getByLabelText('載入中')).toBeInTheDocument();
    unmount();
    renderWithClient(<LobbyPage />, mockClient({ view: 'lobby', connection: 'reconnecting' }));
    expect(screen.getByText('正在連線到伺服器…')).toBeInTheDocument();
  });

  it('列出房間；已滿或遊戲中的房間不能加入', () => {
    const client = mockClient({
      view: 'lobby',
      publicRooms: [
        room(),
        room({ code: 'FULLLL', name: '滿員房', playerCount: 2, colors: [0, 1], joinable: false }),
        room({ code: 'PLAYYY', name: '遊戲房', status: 'playing', joinable: false }),
      ],
    });
    renderWithClient(<LobbyPage />, client);
    expect(screen.getAllByTestId('room-card')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '已滿員' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '遊戲中' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '加入房間' }));
    expect(client.joinRoom).toHaveBeenCalledWith('ABCDEF');
  });
});

describe('等待房間', () => {
  it('顯示代碼、玩家、空位；房主在全員準備後可開始', () => {
    const { room: r } = twoPlayerGame();
    const waiting = { ...r, status: 'ready' as const, maxPlayers: 3 };
    const client = mockClient({ view: 'room', room: waiting, you: { playerId: 'p1', token: 't' } });
    renderWithClient(<WaitingRoom />, client);
    expect(screen.getByText('ABCDEF')).toBeInTheDocument();
    expect(screen.getAllByTestId('player-slot')).toHaveLength(2);
    expect(screen.getByText('等待玩家加入…')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: /開始遊戲/ });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(client.startGame).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '移除 Bob' })).toBeInTheDocument();
  });

  it('非房主看到準備按鈕', () => {
    const { room: r } = twoPlayerGame();
    const notReady = { ...r, status: 'waiting' as const, players: r.players.map((p) => (p.id === 'p2' ? { ...p, ready: false } : p)) };
    const client = mockClient({ view: 'room', room: notReady, you: { playerId: 'p2', token: 't' } });
    renderWithClient(<WaitingRoom />, client);
    fireEvent.click(screen.getByRole('button', { name: /我準備好了/ }));
    expect(client.setReady).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: /開始遊戲/ })).toBeNull();
  });
});

describe('棋盤', () => {
  it('繪製 121 個可點擊棋位與 20 顆棋子，顯示合法落點', () => {
    const { game } = twoPlayerGame();
    const own = game.state.pieces.find((p) => p.seat === 0 && getLegalMoves(game.state, p.cell).size > 0)!;
    const targets = getLegalMoves(game.state, own.cell);
    const onCellClick = vi.fn();
    const { container } = render(
      <Board game={game} mySeat={0} selected={own.cell} targets={targets} preview={null} interactive zoom={1} onCellClick={onCellClick} />,
    );
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(121);
    expect(container.querySelectorAll('[data-own]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-target]')).toHaveLength(targets.size);
    fireEvent.click(container.querySelector(`[data-cell="${own.cell}"]`)!);
    expect(onCellClick).toHaveBeenCalledWith(own.cell);
  });
});

describe('遊戲畫面', () => {
  it('輪到自己時：選棋 → 顯示落點 → 送出棋步；取消可清除選擇', async () => {
    const { room: r, game } = twoPlayerGame();
    const client = mockClient({ view: 'room', room: r, game, you: { playerId: 'p1', token: 't' } });
    const { container } = renderWithClient(<GamePage />, client);
    expect(screen.getAllByText('輪到你了：選擇一顆彈珠').length).toBeGreaterThan(0);

    const own = game.state.pieces.find((p) => p.seat === 0 && getLegalMoves(game.state, p.cell).size > 0)!;
    fireEvent.click(container.querySelector(`[data-cell="${own.cell}"]`)!);
    const target = container.querySelector('[data-target]')!;
    expect(target).not.toBeNull();
    const to = Number(target.getAttribute('data-target'));

    fireEvent.click(screen.getAllByRole('button', { name: /取消/ })[0]!);
    expect(container.querySelector('[data-target]')).toBeNull();

    fireEvent.click(container.querySelector(`[data-cell="${own.cell}"]`)!);
    fireEvent.click(container.querySelector(`[data-cell="${to}"]`)!);
    await waitFor(() => expect(client.makeMove).toHaveBeenCalledWith(own.cell, to));
    expect(client.makeMove).toHaveBeenCalledTimes(1);
  });

  it('不是自己的回合時無法送出棋步', () => {
    const { room: r, game } = twoPlayerGame();
    const client = mockClient({ view: 'room', room: r, game, you: { playerId: 'p2', token: 't' } });
    const { container } = renderWithClient(<GamePage />, client);
    expect(screen.getAllByText(/等待 Alice 行動/).length).toBeGreaterThan(0);
    const own = game.state.pieces.find((p) => p.seat === 1 && getLegalMoves(game.state, p.cell).size > 0)!;
    fireEvent.click(container.querySelector(`[data-cell="${own.cell}"]`)!);
    const target = container.querySelector('[data-target]');
    if (target) fireEvent.click(container.querySelector(`[data-cell="${target.getAttribute('data-target')}"]`)!);
    expect(client.makeMove).not.toHaveBeenCalled();
  });

  it('遊戲結束顯示結算畫面', () => {
    const { room: r, game } = twoPlayerGame();
    const over = { ...game, state: { ...game.state, over: true, winnerSeat: 0 } };
    const client = mockClient({
      view: 'room',
      room: { ...r, status: 'finished' },
      game: over,
      you: { playerId: 'p1', token: 't' },
      result: {
        winnerId: 'p1',
        reason: 'goal',
        rankings: [
          { playerId: 'p1', nickname: 'Alice', colorIndex: 0, inGoal: 10, distance: 0, winner: true },
          { playerId: 'p2', nickname: 'Bob', colorIndex: 1, inGoal: 3, distance: 50, winner: false },
        ],
      },
    });
    renderWithClient(<GamePage />, client);
    expect(screen.getByRole('dialog', { name: '遊戲結算' })).toHaveTextContent('你獲勝了！');
    fireEvent.click(screen.getByRole('button', { name: /再來一局/ }));
    expect(client.returnToRoom).toHaveBeenCalled();
  });
});

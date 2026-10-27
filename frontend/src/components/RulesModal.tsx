import { Modal } from './Modal';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="遊戲規則" wide footer={<button className="btn-primary" onClick={onClose}>我知道了</button>}>
      <div className="space-y-4 text-[15px] leading-relaxed text-white/85">
        <section>
          <h3 className="mb-1 font-display text-lg text-amber-200">🎯 目標</h3>
          <p>把你的 10 顆彈珠，全部移到正對面的星角（目標區）。最先完成的玩家獲勝！</p>
        </section>
        <section>
          <h3 className="mb-1 font-display text-lg text-amber-200">♟️ 怎麼走</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>一步</b>：移動到相鄰的空棋位（六個方向）。
            </li>
            <li>
              <b>跳躍</b>：跳過緊鄰的任何一顆彈珠（自己或對手的都可以），落在它正後方的空位。
            </li>
            <li>
              <b>連跳</b>：跳躍後若還能再跳，可以繼續跳，而且可以改變方向。系統會自動找出所有可達落點。
            </li>
            <li>一步與跳躍不能混用；跳躍不會吃掉棋子。</li>
            <li>每回合只能移動一顆彈珠。</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-display text-lg text-amber-200">🖐️ 操作</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>點選自己的彈珠 → 發光圓圈顯示所有合法落點 → 點選落點完成移動。</li>
            <li>再點一次同一顆彈珠、點空白處、按「取消」或 Esc 可取消選擇。</li>
            <li>可開啟「移動前確認」，先預覽跳躍路線再確認送出。</li>
            <li>手機可用放大鏡按鈕放大棋盤並拖曳瀏覽。</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-display text-lg text-amber-200">👥 人數與座位</h3>
          <p>
            2 人：上下對角；3 人：間隔三角（目標區為空角）；4 人：兩組對角；5 人：五個角落；6 人：全部角落。未使用的角落保持空置。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-display text-lg text-amber-200">⚙️ 房間規則選項</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>目標區鎖定</b>（預設開）：彈珠進入目標區後不能再離開目標區（但可在目標區內移動）。
            </li>
            <li>
              <b>防堵規則</b>（預設開）：若你的目標區 10 格全被佔滿，且其中至少有 1 顆是你的彈珠，即判定你獲勝，防止對手故意佔位阻擋。
            </li>
            <li>
              <b>回合限時</b>：30／60／90 秒，逾時自動跳過該回合。
            </li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-display text-lg text-amber-200">🔌 斷線</h3>
          <p>
            斷線或不小心關掉分頁後，3 分鐘內重新開啟網站（或原本的邀請連結）就會自動回到原座位；首頁也會顯示「回到房間」。斷線玩家輪到時，15 秒後自動跳過；超過 3 分鐘未回來視為離開，其彈珠留在棋盤上作為障礙。只剩一位玩家時，該玩家獲勝。
          </p>
        </section>
      </div>
    </Modal>
  );
}

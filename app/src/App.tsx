import { useApp } from './store'
import { PUBLIC_SCREENS } from './router'
import { SCREENS } from './screens'
import { TitleBar } from './components/TitleBar'
import { Shell } from './components/Shell'
import { AskDialog, Toasts } from './components/ui'
import Mailbox from './screens/mailbox/Mailbox'

/** 枠（左メニュー）なしで全面に表示する画面 */
const BARE = new Set(['S01', 'S02', 'S06', 'S12', 'S13'])

export default function App() {
  const view = useApp((s) => s.view)
  const route = useApp((s) => s.route)
  const userId = useApp((s) => s.userId)
  // 承認者が承認画面から開く製図ページ（承認用URLの有効期間中）もログイン不要
  const isPublic = PUBLIC_SCREENS.includes(route.s) || (route.s === 'S06' && !!route.token)
  const effective = !userId && !isPublic ? { s: 'S01' as const } : route
  const Screen = SCREENS[effective.s]
  const bare = BARE.has(effective.s) || (effective.s === 'S03' && 'forced' in effective && effective.forced)
  return (
    <>
      <div className="backdrop" />
      <div className="window">
        <TitleBar />
        <div className="window-body">
          <div style={{ position: 'absolute', inset: 0, display: view === 'system' ? 'block' : 'none' }}>
            {bare ? <Screen route={effective} key={JSON.stringify(effective)} /> : <Shell><Screen route={effective} /></Shell>}
          </div>
          {view === 'mailbox' && <Mailbox />}
        </div>
      </div>
      <AskDialog />
      <Toasts />
    </>
  )
}

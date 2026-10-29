// ログイン系画面の共通レイアウト：左にフォーム、右に生成したキービジュアル
import type { ReactNode } from 'react'
import hero from '../../assets/img/login_hero.webp'
import icon from '../../assets/img/app_icon.png'
import { UrlBar } from '../../components/Shell'
import type { Route } from '../../router'
import './auth.css'

export function AuthLayout({ route, sid, children }: { route: Route; sid: string; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-side">
        <div className="auth-top">
          <UrlBar route={route} />
        </div>
        <div className="auth-form">
          <div className="auth-brand">
            <img src={icon} alt="" />
            <div>
              <div className="eyebrow" style={{ margin: 0 }}>
                <span className="sid">{sid}</span>PRODUCTION REQUEST SYSTEM
              </div>
              <h1>制作物依頼システム</h1>
            </div>
          </div>
          {children}
        </div>
        <div className="auth-foot">ログインできない場合は、IT担当者へ連絡してください。</div>
      </div>
      <div className="auth-hero">
        <img src={hero} alt="" />
        <div className="auth-hero-shade" />
        <div className="auth-hero-copy">
          <p className="auth-hero-line">制作物の依頼・承認・進捗管理</p>
        </div>
      </div>
    </div>
  )
}

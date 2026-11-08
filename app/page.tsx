'use client'

import Link from 'next/link'
import SourceLink from '@/components/layout/SourceLink'
import ObservatoryBoard from '@/components/landing/ObservatoryBoard'
import GuestAnalysis from '@/components/landing/GuestAnalysis'
import styles from '@/components/landing/landing.module.css'

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="Chessics home">chess<span>ics</span></Link>
        <nav aria-label="Main navigation">
          <Link href="/about">How it works</Link>
          <Link href="/login" className={styles.signInButton}>Sign in</Link>
        </nav>
      </header>
      <div className={styles.layout}>
        <section className={styles.accessPanel} aria-labelledby="landing-title">
          <div className={styles.intro}>
            <h1 id="landing-title"><span>find out why<br />you’re losing.</span><span className={styles.headlineAccent}>not just where.</span></h1>
            <p>Spot the habits that keep costing you games.</p>
          </div>
          <GuestAnalysis />
          <p className={styles.signupLink}>
            <span>No signup required to see your first analysis.</span>
            <Link href="/signup">Create an account</Link>
          </p>
        </section>
        <section className={styles.showcase} aria-label="Sample analysis">
          <ObservatoryBoard />
        </section>
      </div>
      <footer className={styles.footer}>
        <span>Chessics</span>
        <SourceLink />
      </footer>
    </main>
  )
}

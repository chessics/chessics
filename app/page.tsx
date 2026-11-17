'use client'

import Link from 'next/link'
import Gallery from '@/components/landing/Gallery'
import GuestAnalysis from '@/components/landing/GuestAnalysis'
import styles from '@/components/landing/landing.module.css'

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <Gallery />

        <header className={styles.top}>
          <Link href="/" className={styles.logo} aria-label="Chessics home">chessics</Link>
          <nav aria-label="Main navigation">
            <Link href="/about">How it works</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </header>

        <div className={styles.band}>
          <div className={styles.intro}>
            <h1 id="landing-title">Find the move behind the blunder.</h1>
            <p className={styles.subhead}>Chessics traces each blunder back to the move where it started.</p>
          </div>
          <GuestAnalysis />
        </div>
      </section>
    </main>
  )
}

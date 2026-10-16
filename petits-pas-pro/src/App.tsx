import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ProAuthProvider, useProAuth } from '@/auth/ProAuthProvider'
import { ProDataProvider } from '@/auth/ProDataProvider'
import { Layout } from '@/components/Layout'
import { ActivationPage, BlockedPage, LoginPage, MaintenancePage, MfaPage, PhotoPage } from '@/pages/AccessPages'
import { PlatformProvider, usePlatformSettings } from '@/auth/PlatformProvider'
import { DashboardPage, QueuePage } from '@/pages/QueuePages'
import { AgendaPage, ConsultationDetailPage } from '@/pages/ConsultationPages'
import { ProfilePage } from '@/pages/ProfilePage'
import { AdminLayout, AdminOverviewPage } from '@/pages/AdminPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PromotionsPage } from '@/pages/PromotionsPage'
import { AdminConsultationsPage, AdminParentsPage } from '@/pages/AdminTabs'
import { FeedPage } from '@/pages/FeedPage'
import { AdminAccountingPage, ProAccountingPage } from '@/pages/AccountingPages'

// Messagerie chargée à la demande : les bibliothèques de chiffrement (libsodium, Argon2) restent hors du chargement initial.
const MessagesPage = lazy(() => import('@/pages/MessagesPages').then((m) => ({ default: m.MessagesPage })))
const ConversationPage = lazy(() => import('@/pages/MessagesPages').then((m) => ({ default: m.ConversationPage })))

/** Aiguillage selon l'étape d'accès : connexion → double authentification → compte vérifié. */
function Gatekeeper() {
  const { gate } = useProAuth()
  const { pathname } = useLocation()

  // Lien d'invitation ou de réinitialisation : choix du mot de passe avant tout le reste.
  if (pathname === '/activation') return <ActivationPage />

  switch (gate) {
    case 'loading':
      return null
    case 'signed_out':
      return <LoginPage />
    case 'mfa_enroll':
      return <MfaPage mode="enroll" />
    case 'mfa_challenge':
      return <MfaPage mode="challenge" />
    case 'photo_required':
      return <PhotoPage />
    case 'not_professional':
    case 'pending':
      return <BlockedPage reason={gate} />
  }

  return (
    <PlatformProvider>
      <Workspace />
    </PlatformProvider>
  )
}

/** Espaces de travail, une fois l'accès accordé (sauf plateforme en veille pour les non-administrateurs). */
function Workspace() {
  const { canPractice, isAdmin } = useProAuth()
  const { platform } = usePlatformSettings()

  if (platform?.settings.maintenance && !isAdmin) return <MaintenancePage message={platform.settings.maintenance_message} />

  return (
    <ProDataProvider>
      <Suspense fallback={null}>
      <Routes>
        <Route element={<Layout />}>
          {/* Fil d'actualité : écran d'ouverture pour tous. */}
          <Route index element={<FeedPage />} />
          <Route path="actualites" element={<Navigate to="/" replace />} />
          {canPractice && (
            <>
              <Route path="tableau-de-bord" element={<DashboardPage />} />
              <Route path="demandes" element={<QueuePage />} />
              <Route path="agenda" element={<AgendaPage />} />
              <Route path="consultations/:id" element={<ConsultationDetailPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="messages/:consultationId" element={<ConversationPage />} />
              <Route path="ma-comptabilite" element={<ProAccountingPage />} />
              <Route path="profil" element={<ProfilePage />} />
            </>
          )}
          {isAdmin && (
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="consultations" element={<AdminConsultationsPage />} />
              <Route path="parents" element={<AdminParentsPage />} />
            </Route>
          )}
          <Route path="parametres" element={<SettingsPage />} />
          {isAdmin && <Route path="comptabilite" element={<AdminAccountingPage />} />}
          {isAdmin && <Route path="promotions" element={<PromotionsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </ProDataProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <ProAuthProvider>
        <Gatekeeper />
      </ProAuthProvider>
    </BrowserRouter>
  )
}

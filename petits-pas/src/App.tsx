import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { ThemeSync } from '@/components/ThemeSync'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { HomePage } from '@/features/home/HomePage'
import { FeedPage } from '@/features/feed/FeedPage'
import { MorePage } from '@/features/home/MorePage'
import { ChildrenPage } from '@/features/children/ChildrenPage'
import { ChildNewPage } from '@/features/children/ChildNewPage'
import { ChildEditPage } from '@/features/children/ChildEditPage'
import { ConsultationPage } from '@/features/consultation/ConsultationPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

// Modules chargés à la demande : leurs données de référence (étapes CDC, tables OMS) restent hors du bundle initial.
const MilestonesPage = lazy(() => import('@/features/milestones/MilestonesPage').then((m) => ({ default: m.MilestonesPage })))
const GrowthPage = lazy(() => import('@/features/growth/GrowthPage').then((m) => ({ default: m.GrowthPage })))
const MeasurementNewPage = lazy(() => import('@/features/growth/MeasurementPages').then((m) => ({ default: m.MeasurementNewPage })))
const MeasurementEditPage = lazy(() => import('@/features/growth/MeasurementPages').then((m) => ({ default: m.MeasurementEditPage })))
const MemoriesPage = lazy(() => import('@/features/memories/MemoriesPage').then((m) => ({ default: m.MemoriesPage })))
const MemoryDetailPage = lazy(() => import('@/features/memories/MemoryDetailPage').then((m) => ({ default: m.MemoryDetailPage })))
const MemoryNewPage = lazy(() => import('@/features/memories/MemoryPages').then((m) => ({ default: m.MemoryNewPage })))
const MemoryEditPage = lazy(() => import('@/features/memories/MemoryPages').then((m) => ({ default: m.MemoryEditPage })))
const VaccinesPage = lazy(() => import('@/features/vaccines/VaccinesPage').then((m) => ({ default: m.VaccinesPage })))
const BackupPage = lazy(() => import('@/features/backup/BackupPage').then((m) => ({ default: m.BackupPage })))
const AccountPage = lazy(() => import('@/features/auth/AccountPage').then((m) => ({ default: m.AccountPage })))
const RequireSignedIn = lazy(() => import('@/features/auth/AccountPage').then((m) => ({ default: m.RequireSignedIn })))
const SignInPage = lazy(() => import('@/features/auth/SignInPage').then((m) => ({ default: m.SignInPage })))
const SignUpPage = lazy(() => import('@/features/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const ForgotPasswordPage = lazy(() => import('@/features/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })))
const NewPasswordPage = lazy(() => import('@/features/auth/PasswordPages').then((m) => ({ default: m.NewPasswordPage })))
const ProfileEditPage = lazy(() => import('@/features/auth/ProfileEditPage').then((m) => ({ default: m.ProfileEditPage })))
const ConsultationNewPage = lazy(() => import('@/features/consultation/ConsultationNewPage').then((m) => ({ default: m.ConsultationNewPage })))
const PrivacyPage = lazy(() => import('@/features/settings/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const ConsultationMessagesPage = lazy(() =>
  import('@/features/consultation/ConsultationMessagesPage').then((m) => ({ default: m.ConsultationMessagesPage })),
)
const RestoreWelcomePage = lazy(() => import('@/features/backup/RestoreWelcomePage').then((m) => ({ default: m.RestoreWelcomePage })))

export function App() {
  return (
    <AuthProvider>
      <ThemeSync />
      <BrowserRouter>
        <Routes>
          <Route path="/bienvenue" element={<OnboardingPage />} />
          <Route path="/connexion/retour" element={<AuthCallbackPage />} />
          <Route
            path="/restaurer"
            element={
              <Suspense fallback={null}>
                <RestoreWelcomePage />
              </Suspense>
            }
          />
          <Route element={<AppShell />}>
            <Route index element={<FeedPage />} />
            <Route path="enfant" element={<HomePage />} />
            <Route path="etapes" element={<MilestonesPage />} />
            <Route path="souvenirs" element={<MemoriesPage />} />
            <Route path="souvenirs/nouveau" element={<MemoryNewPage />} />
            <Route path="souvenirs/:id" element={<MemoryDetailPage />} />
            <Route path="souvenirs/:id/modifier" element={<MemoryEditPage />} />
            <Route path="croissance" element={<GrowthPage />} />
            <Route path="croissance/nouvelle" element={<MeasurementNewPage />} />
            <Route path="croissance/:id" element={<MeasurementEditPage />} />
            <Route path="plus" element={<MorePage />} />
            <Route path="vaccins" element={<VaccinesPage />} />
            <Route path="sauvegarde" element={<BackupPage />} />
            <Route path="consultation" element={<ConsultationPage />} />
            <Route
              path="consultation/:id/messages"
              element={
                <RequireSignedIn>
                  <ConsultationMessagesPage />
                </RequireSignedIn>
              }
            />
            <Route
              path="consultation/nouvelle"
              element={
                <RequireSignedIn>
                  <ConsultationNewPage />
                </RequireSignedIn>
              }
            />
            <Route path="reglages" element={<SettingsPage />} />
            <Route path="confidentialite" element={<PrivacyPage />} />
            <Route path="enfants" element={<ChildrenPage />} />
            <Route path="enfants/nouveau" element={<ChildNewPage />} />
            <Route path="enfants/:id" element={<ChildEditPage />} />
            <Route path="compte" element={<AccountPage />} />
            <Route
              path="compte/profil"
              element={
                <RequireSignedIn>
                  <ProfileEditPage />
                </RequireSignedIn>
              }
            />
            <Route
              path="compte/mot-de-passe"
              element={
                <RequireSignedIn>
                  <NewPasswordPage />
                </RequireSignedIn>
              }
            />
            <Route path="connexion" element={<SignInPage />} />
            <Route path="inscription" element={<SignUpPage />} />
            <Route path="mot-de-passe-oublie" element={<ForgotPasswordPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <UpdatePrompt />
      </BrowserRouter>
    </AuthProvider>
  )
}

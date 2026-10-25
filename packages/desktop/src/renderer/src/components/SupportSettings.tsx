import { PROJECT_GITHUB_URL } from '@antumi/protocol'
import { t } from '../i18n'
import { ProjectStarSettings } from './ProjectStarSettings'
import { SettingsRow } from './SettingsControls'

export function SupportSettings() {
  return <>
    <ProjectStarSettings />
    <SettingsRow label={t('SettingsPage.projectWebsite')} control={() => (
      <a className="settings-project-link" href={PROJECT_GITHUB_URL} target="_blank" rel="noreferrer">{PROJECT_GITHUB_URL}</a>
    )} />
    <SettingsRow label={t('SupportSettings.feedback')} description={t('SupportSettings.feedbackDescription')} control={() => (
      <a className="button support-feedback-link" href={`${PROJECT_GITHUB_URL}/issues/new`} target="_blank" rel="noreferrer">{t('SupportSettings.openFeedback')}</a>
    )} />
    <SettingsRow label={t('SupportSettings.community')} description={t('SupportSettings.communityDescription')} control={() => (
      <span className="muted">{t('SupportSettings.comingSoon')}</span>
    )} />
  </>
}

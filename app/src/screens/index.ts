// 画面IDと画面部品の対応（S08 は EmployeePicker として各画面に重ねる）
import type { ComponentType } from 'react'
import type { ScreenId } from '../router'
import S01Login from './auth/S01Login'
import S02Password from './auth/S02Password'
import S03SetPassword from './auth/S03SetPassword'
import S04Menu from './S04Menu'
import S05RequestForm from './requester/S05RequestForm'
import S06Drawing from './drawing/S06Drawing'
import S07Reviewers from './requester/S07Reviewers'
import S09Complete from './requester/S09Complete'
import S10MyRequests from './requester/S10MyRequests'
import S11MyRequestDetail from './requester/S11MyRequestDetail'
import S12Approve from './approval/S12Approve'
import S13Result from './approval/S13Result'
import S14RequestList from './equipment/S14RequestList'
import S15RequestDetail from './equipment/S15RequestDetail'
import S16Progress from './equipment/S16Progress'
import S17Results from './equipment/S17Results'
import S18InquiryList from './inquiry/S18InquiryList'
import S19InquiryNew from './inquiry/S19InquiryNew'
import S20InquiryDetail from './inquiry/S20InquiryDetail'
import S21SettingsMenu from './settings/S21SettingsMenu'
import S22Users from './settings/S22Users'
import S23Import from './settings/S23Import'
import S24Circulation from './settings/S24Circulation'
import S25Departments from './settings/S25Departments'
import S26OtherWorks from './settings/S26OtherWorks'
import S27Manage from './settings/S27Manage'
import S28Analytics from './analytics/S28Analytics'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCREENS: Record<ScreenId, ComponentType<{ route: any }>> = {
  S01: S01Login,
  S02: S02Password,
  S03: S03SetPassword,
  S04: S04Menu,
  S05: S05RequestForm,
  S06: S06Drawing,
  S07: S07Reviewers,
  S09: S09Complete,
  S10: S10MyRequests,
  S11: S11MyRequestDetail,
  S12: S12Approve,
  S13: S13Result,
  S14: S14RequestList,
  S15: S15RequestDetail,
  S16: S16Progress,
  S17: S17Results,
  S18: S18InquiryList,
  S19: S19InquiryNew,
  S20: S20InquiryDetail,
  S21: S21SettingsMenu,
  S22: S22Users,
  S23: S23Import,
  S24: S24Circulation,
  S25: S25Departments,
  S26: S26OtherWorks,
  S27: S27Manage,
  S28: S28Analytics,
}

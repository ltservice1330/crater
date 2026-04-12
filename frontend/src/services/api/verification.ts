import { apiPost } from '@/services/client'

import { IResponse } from '../types'

export interface ISendVerificationCodeRequest {
  contact: string
}

export interface ISendVerificationCodeResponse {
  verificationId: string
  expiresIn: number
}

export interface IVerifyCodeRequest {
  verificationId: string
  code: string
}

export interface IVerifyCodeResponse {
  valid: boolean
  contact?: string
}

export const apiSendVerificationCode = (data: ISendVerificationCodeRequest) =>
  apiPost<IResponse<ISendVerificationCodeResponse>>('verification/send', data)

export const apiVerifyCode = (data: IVerifyCodeRequest) =>
  apiPost<IResponse<IVerifyCodeResponse>>('verification/verify', data)

/**
 * Copyright 2025 RAIDS Lab
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import LoadableButton from '@/components/button/loadable-button'

import { apiSignup } from '@/services/api/auth'
import { apiSendVerificationCode } from '@/services/api/verification'
import { ERROR_REGISTER_NOT_FOUND, ERROR_REGISTER_TIMEOUT } from '@/services/error_code'
import { IErrorResponse } from '@/services/types'

import { hashPassword } from '@/utils/password-hash'

const formSchema = z
  .object({
    contact: z
      .string()
      .min(1, {
        message: '邮箱或手机号不能为空',
      })
      .refine(
        (value) => {
          // Email or phone validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          const phoneRegex = /^1[3-9]\d{9}$/
          return emailRegex.test(value) || phoneRegex.test(value)
        },
        {
          message: '请输入有效的邮箱或手机号',
        }
      ),
    verificationCode: z
      .string()
      .min(6, {
        message: '验证码为6位数字',
      })
      .max(6, {
        message: '验证码为6位数字',
      }),
    username: z
      .string()
      .min(1, {
        message: '用户名不能为空',
      })
      .max(20, {
        message: '用户名最多 20 个字符',
      })
      .refine(
        (value) => {
          // Username must start with lowercase letter and can only contain lowercase letters, numbers, and hyphens
          const regex = /^[a-z][a-z0-9-]*[a-z0-9]$/
          return regex.test(value)
        },
        {
          message: '只能包含小写字母和数字，中划线可作为连接符',
        }
      ),
    password: z
      .string()
      .min(6, {
        message: '密码至少 6 个字符',
      })
      .max(20, {
        message: '密码最多 20 个字符',
      }),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: '两次密码输入不一致',
    path: ['passwordConfirm'],
  })

export function SignupForm() {
  const navigate = useNavigate()
  const [verificationId, setVerificationId] = useState<string>('')
  const [countdown, setCountdown] = useState<number>(0)
  const [isSendingCode, setIsSendingCode] = useState(false)

  const { mutate: signupUser, isPending } = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      // Hash password before sending to backend
      const hashedPassword = await hashPassword(values.password, values.username)

      return apiSignup({
        userName: values.username,
        password: hashedPassword,
        contact: values.contact,
        verificationId: verificationId,
        code: values.verificationCode,
      })
    },
    onSuccess: () => {
      toast.success('注册成功')
      navigate({ to: '/auth', search: { redirect: '/', token: '' } })
    },
    onError: (error) => {
      if (isAxiosError<IErrorResponse>(error)) {
        const errorCode = error.response?.data?.code
        switch (errorCode) {
          case ERROR_REGISTER_TIMEOUT:
            toast.error('新用户注册访问 UID Server 超时，请联系管理员')
            return
          case ERROR_REGISTER_NOT_FOUND:
            toast.error('新用户注册访问 UID Server 失败，请联系管理员')
            return
        }
        toast.error(error.response?.data?.msg || '注册失败，请稍后重试')
      } else {
        toast.error('注册失败，请稍后重试')
      }
    },
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contact: '',
      verificationCode: '',
      username: '',
      password: '',
      passwordConfirm: '',
    },
  })

  const handleSendVerificationCode = async () => {
    const contact = form.getValues('contact')

    // Validate contact field before sending
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!contact || (!emailRegex.test(contact) && !phoneRegex.test(contact))) {
      form.setError('contact', {
        type: 'manual',
        message: '请先输入有效的邮箱或手机号',
      })
      return
    }

    setIsSendingCode(true)
    try {
      const response = await apiSendVerificationCode({ contact })
      if (response.data) {
        setVerificationId(response.data.verificationId)
        setCountdown(60)
        toast.success('验证码已发送')

        // Start countdown
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }
    } catch (error) {
      if (isAxiosError<IErrorResponse>(error)) {
        toast.error(error.response?.data?.msg || '发送验证码失败')
      } else {
        toast.error('发送验证码失败，请稍后重试')
      }
    } finally {
      setIsSendingCode(false)
    }
  }

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (isPending) {
      return
    }
    if (!verificationId) {
      toast.error('请先获取验证码')
      return
    }
    signupUser(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="contact"
          render={({ field }) => (
            <FormItem>
              <FormLabel>邮箱或手机号</FormLabel>
              <FormControl>
                <Input placeholder="请输入邮箱或手机号" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription className="text-xs">用于接收验证码和账号通知</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="verificationCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>验证码</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input
                    placeholder="请输入6位验证码"
                    maxLength={6}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <LoadableButton
                  type="button"
                  variant="outline"
                  className="min-w-[100px]"
                  onClick={handleSendVerificationCode}
                  disabled={countdown > 0 || isSendingCode}
                  isLoading={isSendingCode}
                  isLoadingText="发送中"
                >
                  {countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
                </LoadableButton>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>账号</FormLabel>
              <FormControl>
                <Input placeholder="请输入用户名" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription className="text-xs">仅支持小写字母、数字和中划线</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <Input type="password" placeholder="请输入密码" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="passwordConfirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认密码</FormLabel>
              <FormControl>
                <Input type="password" placeholder="请再次输入密码" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <LoadableButton
          isLoadingText="注册中"
          type="submit"
          className="w-full"
          isLoading={isPending}
        >
          注册
        </LoadableButton>
      </form>
    </Form>
  )
}

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
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import DocsButton from '@/components/button/docs-button'
//import CraterIcon from '@/components/icon/crater-icon'
//import CraterText from '@/components/icon/crater-text'
import NotFound from '@/components/placeholder/not-found'

import { AuthMode } from '@/services/api/auth'
import { queryAuthMode } from '@/services/query/auth'

import { configUrlWebsiteBaseAtom } from '@/utils/store/config'
import { useTheme } from '@/utils/theme'

import bcgd from './-components/bcgd.png'
import { ForgotPasswordForm } from './-components/forgot-password-form'
import { LoginForm } from './-components/login-form'
import logo from './-components/logo.png'
import { SignupForm } from './-components/signup-form'

export const Route = createFileRoute('/auth/')({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || undefined,
    token: (search.token as string) || undefined,
  }),
  beforeLoad: ({ context, search }) => {
    // Redirect if already authenticated
    if (context.auth.isAuthenticated && !!search.redirect) {
      throw redirect({ to: search.redirect })
    }
  },
  loader: async ({ context: { queryClient } }) => {
    return queryClient
      .ensureQueryData(queryAuthMode)
      .then((data) => {
        return {
          authMode: data.data,
        }
      })
      .catch(() => {
        return {
          authMode: AuthMode.NORMAL,
        }
      })
  },
  component: LoginPage,
  notFoundComponent: () => <NotFound />,
})

function LoginPage() {
  const searchParams = Route.useSearch()
  const { auth } = Route.useRouteContext()
  const [showSignup, setShowSignup] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [showRegisterDialog, setShowRegisterDialog] = useState(false)
  const { theme, setTheme } = useTheme()
  const currentMode = Route.useLoaderData().authMode
  const website = useAtomValue(configUrlWebsiteBaseAtom)

  // 处理注册按钮点击
  const handleRegisterClick = () => {
    if (currentMode === AuthMode.ACT) {
      setShowRegisterDialog(true)
    } else {
      setShowSignup(true)
      setShowForgotPassword(false)
    }
  }

  // 处理忘记密码按钮点击
  const handleForgotPasswordClick = () => {
    if (currentMode === AuthMode.ACT) {
      toast.info('请联系杨兰老师')
    } else {
      setShowForgotPassword(true)
      setShowSignup(false)
    }
  }

  // 返回登录表单
  const handleBackToLogin = () => {
    setShowSignup(false)
    setShowForgotPassword(false)
  }

  return (
    <div
      className="relative h-screen w-full"
      style={{
        backgroundImage: `url(${bcgd})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    > 
      {/* 顶部Logo */}
      <div className="absolute top-10 left-10 z-20 flex items-center text-lg font-medium">
        <button
          className="flex h-14 w-full flex-row items-center justify-center text-white"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Switch theme"
        >
          < img src={logo} alt="Logo" className="mr-2 h-18 w-28" />
        </button>
      </div>

      {/* 底部版权信息 */}
      <div className="absolute bottom-10 left-10 z-20">
        <blockquote className="space-y-2">
          <footer className="text-sm text-white/80">Copyright @ CHINA UNICOM</footer>
        </blockquote>
      </div>

      {/* 登录表单部分 - 右侧居中显示 */}
      <div className="relative z-10 grid h-full lg:grid-cols-2">
        {/* 左侧空白区域（用于背景展示） */}
        <div className="hidden lg:block" />
        
        {/* 右侧登录表单区域 */}
        <div className="flex h-full items-center justify-center py-12">
        {showSignup && currentMode === AuthMode.NORMAL ? (
          <div className="mx-auto w-[400px] space-y-6 rounded-lg bg-white/95 dark:bg-slate-900/95 p-8 shadow-2xl backdrop-blur-sm">
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold">用户注册</h1>
              <p className="text-muted-foreground text-sm">仅面向特定用户提供此功能</p >
            </div>
            <SignupForm />
            <div className="text-muted-foreground text-center text-sm">
              已有账号？
              <button onClick={handleBackToLogin} className="underline">
                立即登录
              </button>
            </div>
          </div>
        ) : showForgotPassword && currentMode === AuthMode.NORMAL ? (
          <div className="mx-auto w-[400px] space-y-6 rounded-lg bg-white/95 dark:bg-slate-900/95 p-8 shadow-2xl backdrop-blur-sm">
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold">重置密码</h1>
              <p className="text-muted-foreground text-sm">我们将向您的邮箱发送密码重置链接</p >
            </div>
            <ForgotPasswordForm />
            <div className="text-muted-foreground text-center text-sm">
              想起密码了？
              <button onClick={handleBackToLogin} className="underline">
                返回登录
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-[400px] space-y-6 rounded-lg bg-white/95 dark:bg-slate-900/95 p-8 shadow-2xl backdrop-blur-sm">
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold">用户登录</h1>
              <p className="text-muted-foreground text-sm">
                {currentMode === AuthMode.ACT
                  ? '已接入 ACT 实验室统一身份认证'
                  : '请输入您的账号和密码'}
              </p >
            </div>
            <LoginForm
              searchParams={searchParams}
              login={auth.login}
              authMode={currentMode}
              onForgotPasswordClick={handleForgotPasswordClick}
            />
            <div className="text-muted-foreground text-center text-sm">
              还没有账号？
              <button onClick={handleRegisterClick} className="underline">
                立即注册
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ACT模式下的注册引导对话框 */}
      <AlertDialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>账号激活指南</AlertDialogTitle>
            <AlertDialogDescription>
              第一次登录平台时，需要从 ACT 门户同步用户信息，请参考「
              <a href= "text-primary underline">
                平台访问指南
              </a >
              」激活您的账号。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction asChild>
              <DocsButton title={'立即阅读'} url={`quick-start/login`} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
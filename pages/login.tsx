/**
 * Login page – CSR equivalent of app/(auth)/login/page.tsx
 */

import { useNavigate } from "react-router-dom";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/client";

import {
  type LoginActionState,
  type OTPRequestState,
  type OTPVerifyState,
  imbraceLogin,
  imbraceOTPRequest,
  imbraceOTPVerify,
} from "@/lib/auth/api";

type LoginTab = "password" | "otp";

export default function LoginPage() {
  const { t } = useTranslation("");
  const [activeTab, setActiveTab] = useState<LoginTab>("password");

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">
            {t("Auth.signIn")}
          </h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            {t("Auth.signInSubtext")}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1 mx-4 sm:mx-16">
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === "password"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("password")}
          >
            {t("Auth.signInWithPassword")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === "otp"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("otp")}
          >
            {t("Auth.signInWithOTP")}
          </button>
        </div>

        {activeTab === "password" ? <PasswordLoginForm /> : <OTPLoginForm />}
      </div>
    </div>
  );
}

// ─── Password Login Form ───

function PasswordLoginForm() {
  const navigate = useNavigate();
  const { t } = useTranslation("");
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    imbraceLogin,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status === "failed") {
      const messageKey = state.message || "invalidCredentials";
      toast({ type: "error", description: t(`Auth.${messageKey}`) });
    } else if (state.status === "invalid_data") {
      toast({ type: "error", description: t("Auth.validationFailed") });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      navigate("/select-org");
    }
  }, [state.status, state.message, t, navigate]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label className="font-normal text-zinc-600 dark:text-zinc-400" htmlFor="email">
          {t("Auth.email")}
        </Label>
        <Input
          autoComplete="email"
          autoFocus
          className="bg-muted text-md md:text-sm"
          defaultValue={email}
          id="email"
          name="email"
          placeholder="user@acme.com"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="font-normal text-zinc-600 dark:text-zinc-400" htmlFor="password">
          {t("Auth.password")}
        </Label>
        <Input
          className="bg-muted text-md md:text-sm"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      <SubmitButton isSuccessful={isSuccessful}>
        {t("Auth.signInButton")}
      </SubmitButton>
    </form>
  );
}

// ─── OTP Login Form ───

type OTPStep = "email" | "verify";

function OTPLoginForm() {
  const navigate = useNavigate();
  const { t } = useTranslation("");
  const [step, setStep] = useState<OTPStep>("email");
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [requestState, requestAction] = useActionState<OTPRequestState, FormData>(
    imbraceOTPRequest,
    { status: "idle" },
  );

  const [verifyState, verifyAction] = useActionState<OTPVerifyState, FormData>(
    imbraceOTPVerify,
    { status: "idle" },
  );

  useEffect(() => {
    if (requestState.status === "success") setStep("verify");
    else if (requestState.status === "failed") {
      toast({ type: "error", description: t(`Auth.${requestState.message || "otpRequestFailed"}`) });
    }
  }, [requestState.status, requestState.message, t]);

  useEffect(() => {
    if (verifyState.status === "success") {
      setIsSuccessful(true);
      navigate("/select-org");
    } else if (verifyState.status === "failed") {
      toast({ type: "error", description: t(`Auth.${verifyState.message || "otpVerifyFailed"}`) });
    }
  }, [verifyState.status, verifyState.message, t, navigate]);

  if (step === "email") {
    return <OTPEmailStep email={email} setEmail={setEmail} formAction={requestAction} />;
  }

  return (
    <OTPVerifyStep
      email={email}
      formAction={verifyAction}
      requestAction={requestAction}
      isSuccessful={isSuccessful}
      onBack={() => setStep("email")}
    />
  );
}

function OTPEmailStep({
  email,
  setEmail,
  formAction,
}: {
  email: string;
  setEmail: (email: string) => void;
  formAction: (formData: FormData) => void;
}) {
  const { t } = useTranslation("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    setIsSubmitting(true);
    formAction(formData);
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label className="font-normal text-zinc-600 dark:text-zinc-400" htmlFor="otp-email">
          {t("Auth.email")}
        </Label>
        <Input
          autoComplete="email"
          autoFocus
          className="bg-muted text-md md:text-sm"
          defaultValue={email}
          id="otp-email"
          name="email"
          placeholder="user@acme.com"
          required
          type="email"
        />
      </div>
      <SubmitButton isSuccessful={isSubmitting}>
        {t("Auth.sendOTP")}
      </SubmitButton>
    </form>
  );
}

function OTPVerifyStep({
  email,
  formAction,
  requestAction,
  isSuccessful,
  onBack,
}: {
  email: string;
  formAction: (formData: FormData) => void;
  requestAction: (formData: FormData) => void;
  isSuccessful: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const submitOtp = useCallback(
    (otpValues: string[]) => {
      const code = otpValues.join("").toUpperCase();
      if (code.length !== 6) return;
      const formData = new FormData();
      formData.set("email", email);
      formData.set("otp", code);
      startTransition(() => formAction(formData));
    },
    [email, formAction],
  );

  const handleInput = (index: number, value: string) => {
    if (!/^[a-zA-Z0-9]?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newOtp.every((v) => v !== "")) submitOtp(newOtp);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text/plain").replace(/[^a-zA-Z0-9]/g, "").substring(0, 6).split("");
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) newOtp[i] = pasted[i];
    setOtp(newOtp);
    if (newOtp.every((v) => v !== "")) submitOtp(newOtp);
  };

  const handleResend = () => {
    if (!canResend) return;
    setCanResend(false);
    setCountdown(60);
    setOtp(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();
    const formData = new FormData();
    formData.set("email", email);
    requestAction(formData);
  };

  return (
    <div className="flex flex-col gap-4 px-4 sm:px-16">
      <p className="text-center text-sm text-muted-foreground">
        {t("Auth.enterOTP")}<br />
        <span className="font-medium text-foreground">{email}</span>
        <button type="button" className="ml-2 text-sm text-primary underline" onClick={onBack}>
          {t("Auth.useAnotherEmail")}
        </button>
      </p>
      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <Input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            className="h-12 w-12 bg-muted text-center text-lg font-medium uppercase"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInput(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            autoFocus={index === 0}
            disabled={isSuccessful}
          />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("Auth.checkSpam")}</p>
      <div className="text-center">
        <button
          type="button"
          className="text-sm text-primary disabled:text-muted-foreground"
          disabled={!canResend}
          onClick={handleResend}
        >
          {canResend ? t("Auth.resendOTP") : `${t("Auth.resendOTP")} (${countdown}s)`}
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Loader2, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbyn0a8R4JH8JDCENrFpjsG2jQ1WTaZZzDNzgTqp6-bcM843ZWp-bdFbzn_tOthHk-Rz/exec";

const ADMIN_PHONE = "01029733421";

const SPACES = [
  { id: "room-1", name: "회의실 1", capacity: "최대 12명", desc: "팀 회의, 교육, 모임 운영에 적합" },
  { id: "room-2", name: "회의실 2", capacity: "최대 8명", desc: "소규모 회의, 상담, 인터뷰에 적합" },
  { id: "room-3", name: "회의실 3", capacity: "최대 8명", desc: "집중 회의, 스터디, 간단한 워크숍에 적합" },
] as const;

const DATES = [
  "2026-05-10",
  "2026-05-11",
  "2026-05-12",
  "2026-05-13",
  "2026-05-14",
  "2026-05-15",
] as const;

const SUNDAY_SLOTS = [
  "10:00-11:00",
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
] as const;

const WEEKDAY_SLOTS = [
  "10:00-11:00",
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
] as const;

type Reservation = {
  id: string;
  spaceId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  status: string;
  createdAt?: string;
};

type ActiveUser = {
  name: string;
  phone: string;
  isVerified: boolean;
  isAdmin: boolean;
};

type ViewMode = "user" | "admin";

type FormState = {
  name: string;
  phone: string;
  spaceId: string;
  date: string;
  time: string;
};

type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  isAdmin?: boolean;
  reservations?: T;
  reservationId?: string;
};

export default function ReservationLandingPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeUser, setActiveUser] = useState<ActiveUser>({
    name: "",
    phone: "",
    isVerified: false,
    isAdmin: false,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("user");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    spaceId: SPACES[0].id,
    date: DATES[0],
    time: SUNDAY_SLOTS[0],
  });

  const normalizedPhone = normalizePhone(form.phone);
  const activePhone = normalizePhone(activeUser.phone);
  const isAdmin = activeUser.isAdmin || activePhone === ADMIN_PHONE;
  const showAdminPanel = viewMode === "admin" && isAdmin;

  const dateSlots = useMemo(() => getTimeSlotsForDate(form.date), [form.date]);
  const currentSpace = SPACES.find((space) => space.id === form.spaceId);
  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;

  const isDuplicate = useMemo(() => {
    return reservations.some(
      (item) =>
        item.spaceId === form.spaceId &&
        item.date === form.date &&
        item.time === form.time &&
        item.status === "예약완료" &&
        item.id !== selectedReservationId,
    );
  }, [form.spaceId, form.date, form.time, reservations, selectedReservationId]);

  const exceedsReservationLimit = useMemo(() => {
    return reservations.some(
      (item) =>
        normalizePhone(item.phone) === normalizedPhone &&
        item.status === "예약완료" &&
        item.id !== selectedReservationId,
    );
  }, [reservations, normalizedPhone, selectedReservationId]);

  const availableTimes = useMemo(() => {
    return dateSlots.map((slot) => {
      const found = reservations.find(
        (item) =>
          item.spaceId === form.spaceId &&
          item.date === form.date &&
          item.time === slot &&
          item.status === "예약완료" &&
          item.id !== selectedReservationId,
      );
      return { slot, found, taken: Boolean(found) };
    });
  }, [dateSlots, reservations, form.spaceId, form.date, selectedReservationId]);

  const myReservations = useMemo(() => {
    return reservations
      .filter((item) => normalizePhone(item.phone) === activePhone && item.status === "예약완료")
      .sort(compareReservations);
  }, [reservations, activePhone]);

  const adminReservations = useMemo(() => {
    return [...reservations]
      .filter((item) => item.status === "예약완료")
      .sort(compareReservations);
  }, [reservations]);

  async function loadReservations() {
    setIsLoadingReservations(true);
    try {
      const data = await apiGet<ApiResponse<Reservation[]>>("reservations");
      if (data.success && Array.isArray(data.reservations)) {
        setReservations(data.reservations);
      } else {
        setMessage(data.message || "예약 현황을 불러오지 못했습니다.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "예약 현황을 불러오지 못했습니다.");
    } finally {
      setIsLoadingReservations(false);
    }
  }

  async function handleIdentityApply() {
    if (!form.name.trim() || normalizedPhone.length !== 11) {
      setMessage("이름과 전화번호 11자리를 정확히 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiPost<ApiResponse>({
        action: "verifyUser",
        name: form.name.trim(),
        phone: normalizedPhone,
      });

      if (!data.success) {
        setMessage(data.message || "이용자 확인에 실패했습니다.");
        return;
      }

      const adminFlag = Boolean(data.isAdmin) || normalizedPhone === ADMIN_PHONE;
      setActiveUser({
        name: form.name.trim(),
        phone: normalizedPhone,
        isVerified: true,
        isAdmin: adminFlag,
      });
      await loadReservations();
      setMessage(adminFlag ? "관리자 번호가 확인되었습니다." : "등록된 이용자 확인이 완료되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이용자 확인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim() || normalizedPhone.length !== 11) {
      setMessage("이름과 전화번호 11자리를 정확히 입력해 주세요.");
      return;
    }

    if (!activeUser.isVerified || activePhone !== normalizedPhone || activeUser.name !== form.name.trim()) {
      setMessage("먼저 '내 정보 적용'으로 본인 확인을 완료해 주세요.");
      return;
    }

    if (isDuplicate) {
      setMessage("이미 선점된 시간입니다. 다른 시간대를 선택해 주세요.");
      return;
    }

    if (exceedsReservationLimit) {
      setMessage("운영 기간 중 1인 1회만 예약할 수 있습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedReservationId !== null) {
        const data = await apiPost<ApiResponse>({
          action: "updateReservation",
          id: selectedReservationId,
          name: form.name.trim(),
          phone: normalizedPhone,
          spaceId: form.spaceId,
          date: form.date,
          time: form.time,
        });

        if (!data.success) {
          setMessage(data.message || "예약 수정에 실패했습니다.");
          return;
        }

        setMessage(data.message || "예약이 수정되었습니다.");
        setSelectedReservationId(null);
      } else {
        const data = await apiPost<ApiResponse>({
          action: "createReservation",
          name: form.name.trim(),
          phone: normalizedPhone,
          spaceId: form.spaceId,
          date: form.date,
          time: form.time,
        });

        if (!data.success) {
          setMessage(data.message || "예약 생성에 실패했습니다.");
          return;
        }

        setMessage(data.message || "예약이 완료되었습니다.");
      }

      await loadReservations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "예약 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEdit(id: string) {
    const target = reservations.find((item) => item.id === id);
    if (!target) {
      setMessage("예약 정보를 찾지 못했습니다.");
      return;
    }

    const targetPhone = normalizePhone(target.phone);
    if (!isAdmin && targetPhone !== activePhone) {
      setMessage("본인 예약만 수정할 수 있습니다.");
      return;
    }

    setSelectedReservationId(id);
    setForm({
      name: target.name,
      phone: normalizePhone(target.phone),
      spaceId: target.spaceId,
      date: target.date,
      time: target.time,
    });
    setMessage(isAdmin ? "관리자 수정 모드입니다." : "내 예약 수정 모드입니다.");
  }

  async function handleDelete(id: string) {
    const target = reservations.find((item) => item.id === id);
    if (!target) {
      setMessage("예약 정보를 찾지 못했습니다.");
      return;
    }

    const targetPhone = normalizePhone(target.phone);
    if (!isAdmin && targetPhone !== activePhone) {
      setMessage("본인 예약만 삭제할 수 있습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiPost<ApiResponse>({
        action: "deleteReservation",
        id,
        phone: activePhone,
      });

      if (!data.success) {
        setMessage(data.message || "예약 취소에 실패했습니다.");
        return;
      }

      if (selectedReservationId === id) {
        setSelectedReservationId(null);
      }
      setMessage(data.message || "예약이 취소되었습니다.");
      await loadReservations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "예약 취소 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 via-white to-neutral-100 text-neutral-900">
      <section className="border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                청년동 회의실 예약
              </div>
              <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                쉽고 빠르게 확인하고,
                <br />
                바로 예약하는 회의실 신청
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 md:text-lg">
                2026년 5월 10일 일요일부터 5월 15일 금요일까지 예약을 받고 있습니다. 일요일은 10:00~17:00,
                월~금은 10:00~21:00까지 1시간 단위로 이용할 수 있으며, 운영 기간 중 1인 1회만 예약 가능합니다.
              </p>
              <div className="mt-7 flex flex-wrap gap-3 text-sm text-neutral-600">
                <Badge>회의실 1 최대 12명</Badge>
                <Badge>회의실 2 최대 8명</Badge>
                <Badge>회의실 3 최대 8명</Badge>
                <Badge>전화번호 기반 본인 확인</Badge>
              </div>
            </div>

            <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-xl shadow-neutral-200/40">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="운영 공간" value={`${SPACES.length}개`} icon={<MapPin className="h-4 w-4" />} />
                <StatCard label="예약 기간" value="6일" icon={<CalendarDays className="h-4 w-4" />} />
                <StatCard label="운영 단위" value="1시간" icon={<Clock3 className="h-4 w-4" />} />
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                등록된 이용자 명단과 이름·전화번호가 일치해야 예약할 수 있습니다. 다른 이용자의 상세 연락처는 보이지 않으며, 내 예약만 별도 목록에서 확인할 수 있습니다.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:px-10 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-8">
          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Step 1</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">예약자 정보 확인</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  등록된 이용자만 이름과 전화번호로 본인 확인 후 예약할 수 있습니다. 관리자 번호로 접속하면 관리자 화면을 열 수 있습니다. 미리보기 환경에서는 네트워크 권한 팝업이 반복될 수 있어, 아래 버튼으로 직접 연결하는 방식으로 동작합니다.
                </p>
              </div>
              <div className="rounded-2xl bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                현재 상태: <span className="font-semibold">{isAdmin ? "관리자 가능" : activeUser.isVerified ? "본인 확인 완료" : "일반 예약자"}</span>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="이름" icon={<UserRound className="h-4 w-4" />}>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                  placeholder="이름을 입력해 주세요"
                />
              </Field>

              <Field label="전화번호" icon={<Phone className="h-4 w-4" />}>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: onlyDigits(e.target.value) }))}
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                  placeholder="숫자만 입력해 주세요"
                  maxLength={11}
                />
              </Field>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleIdentityApply()}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  내 정보 적용
                </button>
                <button
                  type="button"
                  onClick={() => void loadReservations()}
                  disabled={isLoadingReservations}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 disabled:opacity-60"
                >
                  {isLoadingReservations ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  예약 현황 불러오기
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setViewMode((prev) => (prev === "admin" ? "user" : "admin"))}
                    className="rounded-2xl border border-emerald-300 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-800"
                  >
                    {showAdminPanel ? "예약자 화면으로 보기" : "관리자 화면 열기"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Step 2</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">예약 신청</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  이미 선점된 시간은 선택할 수 없습니다. 전화번호 기준으로 운영 기간 전체에서 한 번만 예약할 수 있습니다. 먼저 예약 현황을 불러온 뒤 신청해 주세요.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                선택 공간: <span className="font-semibold">{currentSpace?.name}</span>
              </div>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-5 md:grid-cols-2">
              <Field label="공간 선택" icon={<MapPin className="h-4 w-4" />}>
                <select
                  value={form.spaceId}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      spaceId: e.target.value,
                      time: getTimeSlotsForDate(prev.date)[0],
                    }))
                  }
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                >
                  {SPACES.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name} · {space.capacity}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="날짜 선택" icon={<CalendarDays className="h-4 w-4" />}>
                <select
                  value={form.date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    const nextSlots = getTimeSlotsForDate(nextDate);
                    setForm((prev) => ({ ...prev, date: nextDate, time: nextSlots[0] }));
                  }}
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                >
                  {DATES.map((date) => (
                    <option key={date} value={date}>
                      {formatDate(date)}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="md:col-span-2">
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
                  <Clock3 className="h-4 w-4" />
                  시간 선택
                </label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {availableTimes.map(({ slot, taken, found }) => {
                    const selected = form.time === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={taken}
                        onClick={() => setForm((prev) => ({ ...prev, time: slot }))}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                          taken
                            ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                            : selected
                              ? "border-neutral-900 bg-neutral-900 text-white"
                              : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-900"
                        }`}
                      >
                        <div>{slot}</div>
                        <div className="mt-1 text-[11px] font-normal">
                          {taken ? "선점 완료" : selected ? "선택됨" : "예약 가능"}
                        </div>
                        {taken && found && (
                          <div className="mt-1 text-[11px] font-normal">
                            {showAdminPanel ? `${found.name} 예약` : `${maskName(found.name)} 예약`}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {selectedReservation ? "예약 수정 저장" : "예약 신청하기"}
                </button>
                {selectedReservation && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReservationId(null);
                      setMessage("수정 모드를 취소했습니다.");
                    }}
                    className="rounded-2xl border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800"
                  >
                    취소
                  </button>
                )}
                {message && (
                  <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
                    {message}
                  </div>
                )}
              </div>
            </form>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Step 3</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">현재 예약 현황</h2>
              </div>
              <div className="text-sm text-neutral-500">
                {currentSpace?.name} · {formatDate(form.date)}
              </div>
            </div>

            {isLoadingReservations ? (
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                예약 현황을 불러오는 중입니다.
              </div>
            ) : reservations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                아직 불러온 예약 데이터가 없습니다. 상단의 '예약 현황 불러오기' 버튼을 눌러 주세요.
              </div>
            ) : (
              <div className="grid gap-3">
                {dateSlots.map((slot) => {
                  const found = reservations.find(
                    (item) =>
                      item.spaceId === form.spaceId &&
                      item.date === form.date &&
                      item.time === slot &&
                      item.status === "예약완료",
                  );
                  const isMine = !!found && normalizePhone(found.phone) === activePhone;
                  return (
                    <div
                      key={slot}
                      className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 md:flex-row md:items-center md:justify-between ${
                        found ? "border-neutral-200 bg-neutral-50" : "border-emerald-200 bg-emerald-50/50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{slot}</p>
                        <p className="mt-1 text-sm text-neutral-600">
                          {!found
                            ? "예약 가능"
                            : showAdminPanel
                              ? `${found.name} · ${found.status}`
                              : isMine
                                ? `내 예약 · ${found.status}`
                                : `${maskName(found.name)} · 선점 완료`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!found && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700">
                            신청 가능
                          </span>
                        )}
                        {found && isMine && !showAdminPanel && (
                          <>
                            <button
                              onClick={() => handleEdit(found.id)}
                              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              내 예약 수정
                            </button>
                            <button
                              onClick={() => void handleDelete(found.id)}
                              className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                            >
                              내 예약 취소
                            </button>
                          </>
                        )}
                        {found && showAdminPanel && (
                          <>
                            <button
                              onClick={() => handleEdit(found.id)}
                              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              관리자 수정
                            </button>
                            <button
                              onClick={() => void handleDelete(found.id)}
                              className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-emerald-700">공간 안내</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">어떤 공간을 예약할 수 있나요?</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              원하는 목적에 맞는 회의실을 선택해 주세요. 공간별 수용 인원을 참고하면 더 편하게 예약할 수 있습니다.
            </p>
            <div className="mt-5 grid gap-4">
              {SPACES.map((space) => (
                <div
                  key={space.id}
                  className={`rounded-2xl border p-4 transition ${
                    form.spaceId === space.id
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-neutral-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold">{space.name}</p>
                      <p
                        className={`mt-1 text-sm ${
                          form.spaceId === space.id ? "text-neutral-300" : "text-neutral-600"
                        }`}
                      >
                        {space.desc}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        form.spaceId === space.id ? "bg-white text-neutral-900" : "bg-white text-neutral-700"
                      }`}
                    >
                      {space.capacity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">내 예약</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">내가 신청한 예약만 보기</h2>
              </div>
              <div className="text-sm text-neutral-500">{formatPhone(activePhone)}</div>
            </div>
            <div className="mb-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
              홈페이지에서는 다른 이용자의 상세 예약 정보가 따로 보이지 않고, 내 예약만 별도로 확인할 수 있게 구성했습니다.
            </div>
            <div className="space-y-3">
              {myReservations.length === 0 && (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                  현재 확인되는 내 예약이 없습니다.
                </div>
              )}
              {myReservations.map((item) => (
                <div key={item.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{getSpaceName(item.spaceId)}</p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {formatDate(item.date)} · {item.time} · {item.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                        {item.status}
                      </span>
                      <button
                        onClick={() => handleEdit(item.id)}
                        className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => void handleDelete(item.id)}
                        className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showAdminPanel && (
            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">관리자 전용</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">전체 예약 관리</h2>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
                  관리자 번호 확인 완료
                </div>
              </div>

              <div className="space-y-3">
                {adminReservations.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold">
                          {getSpaceName(item.spaceId)} · {formatDate(item.date)} · {item.time}
                        </p>
                        <p className="mt-1 text-sm text-neutral-600">
                          예약자 {item.name} · {formatPhone(normalizePhone(item.phone))}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleEdit(item.id)}
                          className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => void handleDelete(item.id)}
                          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

async function apiGet<T>(action: string, params?: Record<string, string>) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("_ts", String(Date.now()));

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("API 요청에 실패했습니다.");
  }

  return (await response.json()) as T;
}

async function apiPost<T>(payload: Record<string, unknown>) {
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("API 요청에 실패했습니다.");
  }

  return (await response.json()) as T;
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium">
      {children}
    </span>
  );
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getSpaceName(spaceId: string) {
  return SPACES.find((space) => space.id === spaceId)?.name || "공간";
}

function getTimeSlotsForDate(dateString: string): string[] {
  const date = new Date(dateString);
  const day = date.getDay();
  return day === 0 ? [...SUNDAY_SLOTS] : [...WEEKDAY_SLOTS];
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePhone(value: string | undefined | null) {
  return onlyDigits(value || "");
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function maskName(name: string) {
  if (!name) return "예약자";
  if (name.length === 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}*${name[name.length - 1]}`;
}

function compareReservations(a: Reservation, b: Reservation) {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const slots = getTimeSlotsForDate(a.date);
  return slots.indexOf(a.time) - slots.indexOf(b.time);
}

const DEV_TEST_CASES = [
  normalizePhone("010-8924-7928") === "01089247928",
  maskName("박지은") === "박*은",
  formatPhone("01029733421") === "010-2973-3421",
  getTimeSlotsForDate("2026-05-10").length === 7,
  getTimeSlotsForDate("2026-05-11").length === 11,
  getSpaceName("room-2") === "회의실 2",
];

if (typeof window !== "undefined" && DEV_TEST_CASES.some((passed) => !passed)) {
  console.warn("ReservationLandingPage self-check failed.");
}

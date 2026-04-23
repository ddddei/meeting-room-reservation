import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbynuOiLCCfhGo7jDpqlhDM2S0CXEujm78uR1x5-CNVofUOgoEM_MpPEqVLgm_abOIO8/exec";

const ADMIN_PHONE = "01029733421";

const SPACES = [
  { id: "room-1", name: "회의실 1", capacity: "최대 12명", desc: "팀 회의, 교육, 모임 운영" },
  { id: "room-2", name: "회의실 2", capacity: "최대 8명", desc: "소규모 회의, 상담, 인터뷰" },
  { id: "room-3", name: "회의실 3", capacity: "최대 8명", desc: "집중 회의, 스터디, 워크숍" },
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    <div className="min-h-screen bg-[#f7f8f5] text-neutral-900">
      <section className="border-b border-emerald-100 bg-gradient-to-b from-[#eef8f0] to-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm sm:text-sm">
                <ShieldCheck className="h-4 w-4" />
                청년동 회의실 예약
              </div>
              <h1 className="text-3xl font-black leading-tight tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
                필요한 시간만,
                <br />
                빠르게 예약하세요
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
                5월 10일부터 5월 15일까지 회의실 예약을 받습니다. 일요일은 10:00~17:00, 월~금은 10:00~21:00 운영이며, 운영 기간 중 1인 1회만 신청할 수 있습니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill>전화번호 본인 확인</Pill>
                <Pill>1시간 단위 예약</Pill>
                <Pill>운영 기간 1회 제한</Pill>
              </div>
            </div>

            <div className="rounded-[28px] border border-emerald-100 bg-white p-4 shadow-lg shadow-emerald-100/40 sm:p-5">
              <div className="grid grid-cols-3 gap-3">
                <QuickStat label="공간" value={`${SPACES.length}개`} />
                <QuickStat label="기간" value="6일" />
                <QuickStat label="단위" value="1시간" />
              </div>
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
                등록된 이용자만 예약 가능하며, 다른 이용자의 상세 연락처는 보이지 않습니다. 내 예약만 별도로 확인할 수 있습니다.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.03fr_0.97fr]">
          <div className="space-y-6">
            <CardShell>
              <SectionHead
                step="Step 1"
                title="예약자 정보 확인"
                description="이름과 전화번호를 입력하고 본인 확인을 완료해 주세요. 관리자 번호로 접속하면 관리자 화면을 열 수 있습니다."
                side={
                  <StatusChip>
                    {isAdmin ? "관리자 가능" : activeUser.isVerified ? "본인 확인 완료" : "일반 예약자"}
                  </StatusChip>
                }
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="이름" icon={<UserRound className="h-4 w-4" />}>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-emerald-500"
                    placeholder="이름을 입력해 주세요"
                  />
                </Field>

                <Field label="전화번호" icon={<Phone className="h-4 w-4" />}>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: onlyDigits(e.target.value) }))}
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-emerald-500"
                    placeholder="숫자만 입력해 주세요"
                    maxLength={11}
                  />
                </Field>

                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <PrimaryButton type="button" onClick={() => void handleIdentityApply()} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    내 정보 적용
                  </PrimaryButton>

                  <SecondaryButton type="button" onClick={() => void loadReservations()} disabled={isLoadingReservations}>
                    {isLoadingReservations ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    예약 현황 불러오기
                  </SecondaryButton>

                  {isAdmin && (
                    <SecondaryButton
                      type="button"
                      onClick={() => setViewMode((prev) => (prev === "admin" ? "user" : "admin"))}
                      className="sm:col-span-2 lg:col-span-1 border-emerald-200 bg-emerald-50 text-emerald-800"
                    >
                      {showAdminPanel ? "예약자 화면으로 보기" : "관리자 화면 열기"}
                    </SecondaryButton>
                  )}
                </div>
              </div>
            </CardShell>

            <CardShell>
              <SectionHead
                step="Step 2"
                title="예약 신청"
                description="공간, 날짜, 시간을 차례대로 선택해 주세요. 이미 예약된 시간은 선택할 수 없습니다."
                side={<StatusChip>선택 공간: {currentSpace?.name}</StatusChip>}
              />

              <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 sm:grid-cols-2">
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
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-emerald-500"
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
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-emerald-500"
                  >
                    {DATES.map((date) => (
                      <option key={date} value={date}>
                        {formatDate(date)}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="sm:col-span-2">
                  <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
                    <Clock3 className="h-4 w-4" />
                    시간 선택
                  </label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {availableTimes.map(({ slot, taken, found }) => {
                      const selected = form.time === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={taken}
                          onClick={() => setForm((prev) => ({ ...prev, time: slot }))}
                          className={`min-h-[86px] rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                            taken
                              ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                              : selected
                                ? "border-emerald-700 bg-emerald-600 text-white shadow-md shadow-emerald-200"
                                : "border-neutral-300 bg-white text-neutral-800 hover:border-emerald-400"
                          }`}
                        >
                          <div>{slot}</div>
                          <div className="mt-1 text-[11px] font-medium opacity-90">
                            {taken ? "선점 완료" : selected ? "선택됨" : "예약 가능"}
                          </div>
                          {taken && found && (
                            <div className="mt-1 text-[11px] font-normal opacity-90">
                              {showAdminPanel ? `${found.name} 예약` : `${maskName(found.name)} 예약`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <PrimaryButton type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {selectedReservation ? "예약 수정 저장" : "예약 신청하기"}
                  </PrimaryButton>

                  {selectedReservation && (
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setSelectedReservationId(null);
                        setMessage("수정 모드를 취소했습니다.");
                      }}
                    >
                      취소
                    </SecondaryButton>
                  )}

                  {message && (
                    <div className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {message}
                    </div>
                  )}
                </div>
              </form>
            </CardShell>

            <CardShell>
              <SectionHead
                step="Step 3"
                title="현재 예약 현황"
                description={`${currentSpace?.name} · ${formatDate(form.date)}`}
              />

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
                        className={`rounded-2xl border px-4 py-4 ${found ? "border-neutral-200 bg-white" : "border-emerald-200 bg-emerald-50/60"}`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                            {!found && <MiniTag>신청 가능</MiniTag>}
                            {found && isMine && !showAdminPanel && (
                              <>
                                <MiniAction onClick={() => handleEdit(found.id)}>내 예약 수정</MiniAction>
                                <MiniGhost onClick={() => void handleDelete(found.id)}>내 예약 취소</MiniGhost>
                              </>
                            )}
                            {found && showAdminPanel && (
                              <>
                                <MiniAction onClick={() => handleEdit(found.id)}>관리자 수정</MiniAction>
                                <MiniGhost onClick={() => void handleDelete(found.id)}>삭제</MiniGhost>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardShell>
          </div>

          <div className="space-y-6">
            <CardShell>
              <SectionHead
                step="공간 안내"
                title="어떤 공간을 예약할 수 있나요?"
                description="공간별 수용 인원과 성격을 보고 알맞은 회의실을 선택해 주세요."
              />
              <div className="grid gap-4">
                {SPACES.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, spaceId: space.id }))}
                    className={`rounded-2xl border p-4 text-left transition ${
                      form.spaceId === space.id
                        ? "border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-200"
                        : "border-neutral-200 bg-neutral-50 hover:border-emerald-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold">{space.name}</p>
                        <p className={`mt-1 text-sm ${form.spaceId === space.id ? "text-emerald-50" : "text-neutral-600"}`}>
                          {space.desc}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${form.spaceId === space.id ? "bg-white text-emerald-700" : "bg-white text-neutral-700"}`}>
                        {space.capacity}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardShell>

            <CardShell>
              <SectionHead
                step="내 예약"
                title="내가 신청한 예약만 보기"
                description={formatPhone(activePhone)}
              />
              <div className="mb-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
                다른 이용자의 상세 예약 정보는 보이지 않고, 내 예약만 별도로 확인할 수 있습니다.
              </div>
              <div className="space-y-3">
                {myReservations.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                    현재 확인되는 내 예약이 없습니다.
                  </div>
                )}
                {myReservations.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{getSpaceName(item.spaceId)}</p>
                        <p className="mt-1 text-sm text-neutral-600">
                          {formatDate(item.date)} · {item.time} · {item.name}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <MiniTag>{item.status}</MiniTag>
                        <MiniAction onClick={() => handleEdit(item.id)}>수정</MiniAction>
                        <MiniGhost onClick={() => void handleDelete(item.id)}>취소</MiniGhost>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardShell>

            {showAdminPanel && (
              <CardShell className="border-emerald-200 bg-emerald-50/60">
                <SectionHead
                  step="관리자 전용"
                  title="전체 예약 관리"
                  description="전체 예약을 확인하고 수정 또는 삭제할 수 있습니다."
                />
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
                          <MiniAction onClick={() => handleEdit(item.id)}>수정</MiniAction>
                          <MiniGhost onClick={() => void handleDelete(item.id)}>삭제</MiniGhost>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardShell>
            )}
          </div>
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

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</div>;
}

function SectionHead({
  step,
  title,
  description,
  side,
}: {
  step: string;
  title: string;
  description: string;
  side?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-emerald-700">{step}</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-neutral-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
      </div>
      {side ? side : null}
    </div>
  );
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-neutral-100 px-4 py-2 text-sm text-neutral-700">{children}</div>;
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center">
      <div className="text-xs font-medium text-neutral-500 sm:text-sm">{label}</div>
      <div className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{value}</div>
    </div>
  );
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

function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function MiniAction({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button {...props} className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">
      {children}
    </button>
  );
}

function MiniGhost({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button {...props} className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700">
      {children}
    </button>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700">{children}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 sm:text-sm">{children}</span>;
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

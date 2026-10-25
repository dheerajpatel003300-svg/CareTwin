"use client";

import { useState } from "react";
import { Mail, UserRound } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { TextArea, TextInput, btnPrimary } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { Stagger, StaggerItem } from "@/components/ui/Motion";
import { useCareData } from "@/lib/useCareData";

export default function ProfilePage() {
  const { user, profileState, refresh } = useCareData();

  if (profileState.status === "loading") {
    return <div className="ct-skeleton mx-auto h-96 max-w-[1000px] rounded-2xl" />;
  }

  if (profileState.status === "error" || !user) {
    return (
      <section role="alert" className="mx-auto max-w-[1000px] rounded-xl border border-[#f3b5b5] bg-white p-6 text-sm text-danger">
        <p>{profileState.error ?? "Your profile could not be loaded."}</p>
        <button type="button" onClick={() => void refresh()} className="mt-3 font-semibold underline">Retry</button>
      </section>
    );
  }

  return <ProfileEditor key={JSON.stringify(user)} user={user} />;
}

function ProfileEditor({ user }: { user: NonNullable<ReturnType<typeof useCareData>["user"]> }) {
  const toast = useToast();
  const { updateProfile } = useCareData();
  const [name, setName] = useState([user.firstName, user.lastName].filter(Boolean).join(" "));
  const [phone, setPhone] = useState(user.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth?.slice(0, 10) ?? "");
  const [gender, setGender] = useState(user.gender ?? "");
  const [bloodGroup, setBloodGroup] = useState(user.bloodGroup ?? "");
  const [heightCm, setHeightCm] = useState(user.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(user.weightKg?.toString() ?? "");
  const [allergies, setAllergies] = useState((user.allergies ?? []).join(", "));
  const [conditions, setConditions] = useState((user.conditions ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bmi = Number(heightCm) > 0 && Number(weightKg) > 0
    ? (Number(weightKg) / ((Number(heightCm) / 100) ** 2)).toFixed(1)
    : "";
  const dirty =
    name !== [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    phone !== (user.phone ?? "") ||
    dateOfBirth !== (user.dateOfBirth?.slice(0, 10) ?? "") ||
    gender !== (user.gender ?? "") ||
    bloodGroup !== (user.bloodGroup ?? "") ||
    heightCm !== (user.heightCm?.toString() ?? "") ||
    weightKg !== (user.weightKg?.toString() ?? "") ||
    allergies !== (user.allergies ?? []).join(", ") ||
    conditions !== (user.conditions ?? []).join(", ");

  const parseList = (value: string) =>
    [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts[0]) {
      setError("Enter your name.");
      return;
    }
    const height = heightCm.trim() ? Number(heightCm) : null;
    const weight = weightKg.trim() ? Number(weightKg) : null;
    if (height !== null && (!Number.isFinite(height) || height < 30 || height > 250)) {
      setError("Height must be between 30 and 250 cm.");
      return;
    }
    if (weight !== null && (!Number.isFinite(weight) || weight < 1 || weight > 500)) {
      setError("Weight must be between 1 and 500 kg.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
        phone: phone.trim() || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        bloodGroup: bloodGroup || null,
        heightCm: height,
        weightKg: weight,
        allergies: parseList(allergies),
        conditions: parseList(conditions),
      });
      toast("Profile saved");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Your profile could not be saved.";
      setError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stagger className="mx-auto w-full max-w-[1000px] space-y-5">
      <StaggerItem>
        <section className="flex items-center gap-5 rounded-2xl bg-navy p-6 text-white sm:p-8">
          <Avatar name={name} color="#0878b8" size={80} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name || "Your profile"}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-[#b9c4d8]"><Mail size={14} />{user.email}</p>
          </div>
        </section>
      </StaggerItem>

      <StaggerItem>
        <form onSubmit={(event) => void save(event)} className="space-y-5 rounded-xl border border-line bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <UserRound size={18} className="text-brand" />
            <h2 className="text-sm font-bold text-ink">Account details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Full name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            <TextInput label="Email address" type="email" value={user.email} disabled />
            <TextInput label="Emergency contact" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Add an emergency contact number" />
            <TextInput label="Date of birth" type="date" value={dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDateOfBirth(event.target.value)} />
            <label className="block text-[13px] font-semibold text-[#374151]">
              Gender
              <select value={gender} onChange={(event) => setGender(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe3ea] bg-white px-3 text-sm font-normal text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15">
                <option value="">Not provided</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
          </div>
          <div className="border-t border-line pt-5">
            <h3 className="text-sm font-bold text-ink">Health details</h3>
            <p className="mt-1 text-xs leading-5 text-mute">These details are saved to your profile and used in your Digital twin panel.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-[13px] font-semibold text-[#374151]">
                Blood group
                <select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe3ea] bg-white px-3 text-sm font-normal text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15">
                  <option value="">Not added</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </label>
              <TextInput label="Height (cm)" type="number" min="30" max="250" step="0.1" inputMode="decimal" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="e.g. 172" />
              <TextInput label="Weight (kg)" type="number" min="1" max="500" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="e.g. 68" />
              <div className="rounded-lg bg-[#f8f9fc] p-3">
                <p className="text-[13px] font-semibold text-[#374151]">BMI</p>
                <p className="mt-1 text-sm text-ink">{bmi || "Add height and weight to calculate"}</p>
                <p className="mt-1 text-xs text-mute">Calculated from height and weight.</p>
              </div>
              <TextArea label="Allergies" value={allergies} onChange={(event) => setAllergies(event.target.value)} placeholder="Separate entries with commas" />
              <TextArea label="Conditions" value={conditions} onChange={(event) => setConditions(event.target.value)} placeholder="Separate entries with commas" />
            </div>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <p className="text-xs leading-5 text-mute">Email changes and profile photos are not supported by the current profile API.</p>
          <div className="flex justify-end border-t border-line pt-4">
            <button type="submit" disabled={!dirty || saving} className={`${btnPrimary} disabled:opacity-50`}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </StaggerItem>
    </Stagger>
  );
}

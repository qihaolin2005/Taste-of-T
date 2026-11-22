// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Adventure tab: join a group with a 4-letter code, or start a new one (which makes a code).
import { Screen } from "@/components/shared/ios";
import CreateRoomForm from "@/components/group/CreateRoomForm";
import JoinCodeInput from "@/components/group/JoinCodeInput";

export default function Page() {
  return (
    <Screen title="Adventure" tab="night">
      <section className="mt-3">
        <h2 className="px-4 pb-2 text-[13px] uppercase text-label-2">Have a Code?</h2>
        <JoinCodeInput />
      </section>

      <div className="my-8 flex items-center gap-3 text-[13px] text-label-2">
        <span className="h-[0.5px] flex-1 bg-separator" /> or start a new group <span className="h-[0.5px] flex-1 bg-separator" />
      </div>

      <CreateRoomForm />
    </Screen>
  );
}

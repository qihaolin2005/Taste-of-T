// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Adventure tab: join a group with a 4-letter code, or create a new one (which makes a code).
// Two clearly separate cards: Join (lavender) on top, Create below with its button in the card.
// If you're already in a group (member or host), CurrentGroupGate takes you back to it.
import { Screen } from "@/components/shared/ios";
import CreateRoomForm from "@/components/group/CreateRoomForm";
import CurrentGroupGate from "@/components/group/CurrentGroupGate";
import JoinCodeInput from "@/components/group/JoinCodeInput";

export default function Page() {
  return (
    <Screen title="Adventure" tab="night">
      <CurrentGroupGate>
        <section className="mt-3 rounded-[22px] border border-lilac bg-lavender px-4 pb-4 pt-3.5" aria-labelledby="join-adventure">
          <h2 id="join-adventure" className="text-[18px] font-bold leading-6 tracking-[-0.02em] text-label">
            Join an Adventure
          </h2>
          <p className="mb-3 text-[13px] text-label-2">Got a 4-letter code from a friend?</p>
          <JoinCodeInput />
        </section>

        <CreateRoomForm />
      </CurrentGroupGate>
    </Screen>
  );
}

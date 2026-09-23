import OctopusDemo from "@/components/OctopusDemo";
import { loadSuppliedRecords } from "@/lib/source";

export const dynamic = "force-dynamic";

export default function Page() {
  // The supplied records are read from source/initial.json on every request and never bundled or written.
  const records = loadSuppliedRecords();
  return <OctopusDemo records={records} />;
}

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import {
  importOfficialTspCsv,
  type TspCsvImportState,
} from "./actions";

const INITIAL_STATE: TspCsvImportState = {
  ok: false,
  message: "",
};

export default function TspCsvUploadForm() {
  const router = useRouter();
  const [state, action, pending] =
    useActionState(
      importOfficialTspCsv,
      INITIAL_STATE
    );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <form
      action={action}
      className="tsp-csv-upload-form"
    >
      <label>
        <span>TSP CSV export</span>
        <input
          type="file"
          name="tspCsv"
          accept=".csv,text/csv"
          required
        />
      </label>

      <button
        className="research-button"
        type="submit"
        disabled={pending}
      >
        <FileUp size={15} />
        {pending
          ? "Importing…"
          : "Import TSP CSV"}
      </button>

      {state.message ? (
        <div
          className={
            "tsp-csv-import-status " +
            (state.ok ? "positive" : "critical")
          }
          role="status"
        >
          {state.message}
        </div>
      ) : null}
    </form>
  );
}

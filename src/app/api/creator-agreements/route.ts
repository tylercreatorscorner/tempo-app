import { NextRequest, NextResponse } from "next/server";
import {
  AgreementAccessError,
  readAgreements,
  writeAgreement,
} from "@/lib/agreements/service";
// Keep gated until all financial readers are cut over; preview shares the live database.
const enabled = () => process.env.CREATOR_AGREEMENTS_ENABLED === "true";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  if (!enabled())
    return NextResponse.json(
      { error: "Agreement ledger is not enabled." },
      { status: 404, headers },
    );
  try {
    return NextResponse.json(
      {
        agreements: await readAgreements(
          req.nextUrl.searchParams.get("creatorId") ?? "",
          req.nextUrl.searchParams.get("brandId") ?? "",
        ),
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AgreementAccessError
            ? error.message
            : "Agreements unavailable. Please retry.",
      },
      { status: error instanceof AgreementAccessError ? 403 : 503, headers },
    );
  }
}
export async function POST(req: NextRequest) {
  if (!enabled())
    return NextResponse.json(
      { error: "Agreement ledger is not enabled." },
      { status: 404, headers },
    );
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== req.nextUrl.origin
  )
    return NextResponse.json(
      { error: "Invalid origin." },
      { status: 403, headers },
    );
  try {
    const body = await req.json();
    if (body.preview !== true && process.env.CREATOR_AGREEMENTS_WRITES_ENABLED !== "true")
      return NextResponse.json({error:"Agreement saving is awaiting release verification. Your current terms have not changed."},{status:409,headers});
    const result = await writeAgreement(body.creatorId, body.brandId, body, body.preview === true);
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Agreement could not be saved.",
      },
      { status: error instanceof AgreementAccessError ? 403 : 409, headers },
    );
  }
}

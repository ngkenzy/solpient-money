"use server";

import { redirect } from "next/navigation";

export async function login() {
  redirect("/");
}

export async function signup() {
  redirect("/setup");
}

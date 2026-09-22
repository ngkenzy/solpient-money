-- Solpient Money V0.9.1 — execute reviewed merges through the protected function owner.
-- The function performs its own household/auth.uid() authorization check.

alter function public.merge_truth_accounts(uuid,uuid) security definer;

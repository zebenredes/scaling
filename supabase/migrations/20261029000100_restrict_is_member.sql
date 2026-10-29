-- is_member() la usan las políticas RLS; solo los usuarios autenticados la necesitan.
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

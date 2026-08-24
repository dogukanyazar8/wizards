import { auth } from "@/auth";
import { HomeCommandCenter } from "@/components/home/home-command-center";

/**
 * `/home` — Ana Sayfa "1a Komuta Merkezi" (`05-faz4` §1).
 *
 * `(main)` grubunun layout'u oturumu ve ban kontrolünü **zaten** yapıyor (00-ortak-baglam §6.8);
 * burada ikinci bir `requireAuth` yok. Oturum yalnız görüntüleyenin kimliğini soket köprüsüne
 * vermek için okunur — o noktada oturumun var olduğu layout'un sözleşmesidir.
 */
export default async function HomeRoute() {
  const session = await auth();

  return <HomeCommandCenter viewerId={session?.user.id ?? ""} />;
}

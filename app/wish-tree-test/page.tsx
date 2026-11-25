import WishGarden from "@/components/WishGarden";

export const metadata = { title: "2027 소원 나무 정원" };

export default async function WishTreeTestPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminTest = (await searchParams)["admin-test"] !== undefined;
  return <WishGarden adminTest={adminTest} />;
}

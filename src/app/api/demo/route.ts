import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Creates a ready-to-run demo project that showcases RequirementPilot's
 * multilingual grounding (Egyptian Arabic + code-switching, novelty N7).
 * Idempotent: returns the existing demo project if one is present.
 */
export async function POST(_req: NextRequest) {
  const existing = await db.project.findFirst({ where: { isDemo: true } });
  if (existing) {
    return NextResponse.json({ projectId: existing.id, existed: true });
  }

  const project = await db.project.create({
    data: {
      name: "Demo — Cairo Home-Cooking Marketplace",
      isDemo: true,
      brief:
        "A marketplace mobile app connecting home cooks in Cairo with nearby customers. " +
        "Home cooks publish daily dishes; customers order for lunch delivery. " +
        "Key concerns: cash-on-delivery payments, Arabic-first UI (Egyptian dialect), " +
        "low bandwidth neighbourhoods, and trust/food-safety ratings. " +
        "The founding team is 3 people; MVP must launch within 4 months.",
      evidences: {
        create: [
          {
            code: "E1",
            title: "مقابلة مع الطباخة أم كريم (Maadi)",
            sourceType: "interview",
            language: "ar-EG",
            content:
              "أنا بطبخ أكلة بيتي وأبيع لجيراني بس. عايزة طريقة أعلن فيها أكل اليوم " +
              "وأحدد الكمية لحد ما الخلاص. المشكلة إن الزباين بيتصلوا في أي وقت " +
              "وأنا مش قادرة أتابع الطلبات. عايزة كمان أخلي بنتي تساعدني من غير ما " +
              "تقعد معايا في المطبخ طول اليوم. الفلوس كاش على البرا، مفيش فيزا.",
          },
          {
            code: "E2",
            title: "Operations handbook draft (team internal doc)",
            sourceType: "document",
            language: "en",
            content:
              "Delivery radius must stay under 4 km so food arrives hot. Orders close at " +
              "11:00 for same-day lunch. The cook confirms the menu before 22:00 the night " +
              "before. Payment is cash on delivery in the MVP; card payments are out of " +
              "scope. Each kitchen must upload a food-safety self-check weekly. The app " +
              "must work on 3G connections under 2 MB per screen.",
          },
          {
            code: "E3",
            title: "Stakeholder sync — product owner notes",
            sourceType: "meeting",
            language: "codeswitch",
            content:
              "النهارده اتفقنا إن الـ MVP هيبقى فيه ordering بس من غير wallet. " +
              "بس الـ customer support لازم يكون in-app عشان الناس مش بتحب تتصل. " +
              "We agreed إن الـ ratings لازم تكون visible قبل ما تعمل order — trust is the #1 issue. " +
              "كمان الـ cook لو cancellت order كتير لازم نعمل strike system، " +
              "3 strikes والمطبخ يتقفل مؤقتا. Launch target: before Ramadan season.",
          },
        ],
      },
    },
  });

  return NextResponse.json({ projectId: project.id, existed: false }, { status: 201 });
}

export async function GET() {
  const existing = await db.project.findFirst({ where: { isDemo: true } });
  return NextResponse.json({ projectId: existing?.id ?? null });
}

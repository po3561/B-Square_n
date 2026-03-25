export const ROUTES = {
  HOME: "/",
  CLASSES: "/classes",
  COMMUNITY: "/community",
  CREATE_CLASS: "/create-class",
  MYPAGE: "/mypage",
  LOGIN: "/login",
  SIGNUP: "/signup",
  FIND_ACCOUNT: "/find-account",
  NOTICES: "/notice",
  CONTACT: "/contact",
};

export const NAV_ITEMS = [
  { label: "홈", href: ROUTES.HOME, icon: "Home" },
  { label: "클래스", href: ROUTES.CLASSES, icon: "Grid" },
  { label: "등록", href: ROUTES.CREATE_CLASS, icon: "PlusCircle" },
  { label: "커뮤니티", href: ROUTES.COMMUNITY, icon: "MessageSquare" },
  { label: "마이페이지", href: ROUTES.MYPAGE, icon: "User" },
];

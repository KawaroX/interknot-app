type Character = {
  id: number;
  name: string;
  avatar: string;
  level?: number;
};

export const characters: Character[] = [
  {
    id: 0,
    name: '匿名',
    avatar: '/images/avatar_0.webp',
    level: 0,
  },
  {
    id: 1,
    name: '绳匠',
    avatar: '/images/avatar_1.webp',
    level: 1,
  },
];

export const defaultAvatar = characters[0].avatar;

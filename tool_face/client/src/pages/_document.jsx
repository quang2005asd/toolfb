import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="vi">
      <Head>
        {/* Đã chọn English: ẩn trang tới khi bộ dịch chạy xong để không nháy chữ tiếng Việt (tự hiện lại sau 2,5 giây) */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var l=new URLSearchParams(location.search).get('lang');if(l==='en'||(l!=='vi'&&localStorage.getItem('toolfb_lang')==='en')){var d=document.documentElement;d.setAttribute('data-lang-pending','');d.setAttribute('lang','en');setTimeout(function(){d.removeAttribute('data-lang-pending')},2500)}}catch(e){}"
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Outfit:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

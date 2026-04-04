import { Heart, Facebook, Instagram, Twitter, Mail } from 'lucide-react';
const fixUrl = (url?: string) => {
    if (!url) return "";
    return url.startsWith("http") ? url : `https://${url}`;
};
type FooterProps = {
    companyName?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
    gmail?: string;
};

function Footer({
    companyName,
    instagram,
    facebook,
    twitter,
    gmail,
}: FooterProps) {
    return (
        <div>
            <footer className="w-full bg-white border-t border-gray-50 pt-8 pb-12 shadow-sm">
                <div className="flex flex-col items-center text-center">
                    <div className="mb-6">
                        <h2 className="text-sm font-black text-[#1A3B5D] tracking-[0.3em] uppercase mb-2">{companyName}</h2>
                        <div className="h-0.5 w-8 bg-[#00A3E1] mx-auto rounded-sm"></div>
                    </div>
                    <div className="flex gap-8 mb-6 text-gray-400">

                        {instagram && (
                            <a
                                href={fixUrl(instagram)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-[#00A3E1] transition-colors"
                            >
                                <Instagram size={18} />
                            </a>
                        )}

                        {facebook && (
                            <a
                                href={fixUrl(facebook)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-[#00A3E1] transition-colors"
                            >
                                <Facebook size={18} />
                            </a>
                        )}

                        {twitter && (
                            <a
                                href={fixUrl(twitter)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-[#00A3E1] transition-colors"
                            >
                                <Twitter size={18} />
                            </a>
                        )}

                        {gmail && (
                            <a
                                href={`mailto:${gmail.trim()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-[#00A3E1] transition-colors"
                            >
                                <Mail size={18} />
                            </a>
                        )}

                    </div>
                    <div className="space-y-2">
                        <div className="border-t border-gray-100 w-48 mx-auto">
                            <p className="text-[8px] font-medium text-gray-600 uppercase tracking-[0.15em]">© 2026 All Rights Reserved</p>
                            <div className="mt-2 inline-block px-2 py-1 rounded-sm bg-slate-200">
                                <p className="text-[9px] font-black text-[#11111]/40 uppercase tracking-widest">
                                    Powered by{" "}
                                    <a
                                        className="text-[#00A3E1] cursor-pointer"
                                        href="https://www.sellar.in"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        sellar.in
                                    </a>
                                </p>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            Made with <Heart size={12} className="inline text-red-600 fill-red-500" /> in India
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default Footer

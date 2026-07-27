import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const generateResumePDF = (resume, userName) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const fileName = `resume_${Date.now()}.pdf`;
    const filePath = path.join("uploads", fileName);

    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads");
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text(resume.personal?.name || userName, { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`${resume.personal?.email || ""} | ${resume.personal?.phone || ""}`, { align: "center" });

    doc.moveDown(2);

    // Summary
    if (resume.summary) {
      doc.fontSize(14).text("Summary");
      doc.moveDown();
      doc.fontSize(10).text(resume.summary);
      doc.moveDown(2);
    }

    // Skills
    if (resume.skills?.length) {
      doc.fontSize(14).text("Skills");
      doc.moveDown();
      doc.fontSize(10).text(resume.skills.join(", "));
      doc.moveDown(2);
    }

    // Experience
    if (resume.experience?.length) {
      doc.fontSize(14).text("Experience");
      doc.moveDown();

      resume.experience.forEach((exp) => {
        doc.fontSize(12).text(`${exp.role} - ${exp.company}`);
        doc.fontSize(10).text(exp.duration || "");
        doc.moveDown();
      });
    }

    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};

export default generateResumePDF;
